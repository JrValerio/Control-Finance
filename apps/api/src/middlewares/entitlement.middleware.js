import { dbQuery } from "../db/index.js";
import { getActivePlanFeaturesForUser } from "../services/billing.service.js";

const createPaymentRequiredError = (message = "Recurso disponivel apenas no plano Pro.") => {
  const error = new Error(message);
  error.status = 402;
  return error;
};

const TRIAL_EXPIRED_MESSAGE =
  "Periodo de teste encerrado. Ative seu plano para continuar utilizando esta funcionalidade.";

/**
 * Middleware factory for boolean feature gates.
 * Returns 402 if the authenticated user's active plan has featureName === false.
 *
 * Usage:
 *   router.post("/import/dry-run", requireFeature("csv_import"), handler)
 */
export const requireFeature = (featureName) => async (req, res, next) => {
  try {
    const features = await getActivePlanFeaturesForUser(req.user.id);

    if (features[featureName] === false) {
      return next(createPaymentRequiredError());
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware that attaches the user's full plan features to req.entitlements.
 * Used for numeric caps (e.g. analytics_months_max) where the route needs the value.
 *
 * Usage:
 *   router.get("/trend", attachEntitlements, handler)
 *   // then in handler: req.entitlements.analytics_months_max
 */
export const attachEntitlements = async (req, res, next) => {
  try {
    req.entitlements = await getActivePlanFeaturesForUser(req.user.id);
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware that allows access when the user has an active trial OR a paid subscription.
 * Returns 402 only when BOTH conditions fail (trial expired AND no paid plan).
 *
 * This gate is used for trial-eligible features like the balance forecast.
 * It does NOT grant access to plan-specific features (csv_import, csv_export) —
 * those still require requireFeature().
 *
 * Usage:
 *   router.post("/forecasts/recompute", requireActiveTrialOrPaidPlan, handler)
 */
export const requireActiveTrialOrPaidPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check for an active paid subscription
    const subResult = await dbQuery(
      `SELECT 1 FROM subscriptions
       WHERE user_id = $1
         AND status IN ('active', 'trialing', 'past_due')
       LIMIT 1`,
      [userId],
    );
    if (subResult.rows.length > 0) return next();

    // Check for an active trial (trial_ends_at column added by migration 014)
    const trialResult = await dbQuery(
      `SELECT trial_ends_at FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const trialEndsAt =
      trialResult.rows.length > 0 ? trialResult.rows[0].trial_ends_at : null;

    if (trialEndsAt && new Date(trialEndsAt) > new Date()) return next();

    return next(createPaymentRequiredError(TRIAL_EXPIRED_MESSAGE));
  } catch (error) {
    return next(error);
  }
};
