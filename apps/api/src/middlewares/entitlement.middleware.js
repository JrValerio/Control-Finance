import { dbQuery } from "../db/index.js";
import { getActivePlanFeaturesForUser } from "../services/billing.service.js";

// ---------------------------------------------------------------------------
// Paywall bypass (dev / staging only)
// ---------------------------------------------------------------------------

const parseBypassEmails = () =>
  (process.env.PAYWALL_BYPASS_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isBypassEnabled = () => {
  const enabled = (process.env.PAYWALL_BYPASS_ENABLED || "").toLowerCase();
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  if (isProd) return false;
  return enabled === "true" || enabled === "1";
};

const canBypass = (userEmail) => {
  if (!isBypassEnabled()) return false;
  return parseBypassEmails().includes((userEmail || "").toLowerCase());
};

// Features granted to bypass users (equivalent to PRO).
const BYPASS_FEATURES = {
  csv_import: true,
  csv_export: true,
  analytics_months_max: 24,
  budget_tracking: true,
};

// ---------------------------------------------------------------------------

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
 * Bypass: skipped entirely when PAYWALL_BYPASS_ENABLED=true (non-prod only)
 * and the user's email is in PAYWALL_BYPASS_EMAILS.
 *
 * Usage:
 *   router.post("/import/dry-run", requireFeature("csv_import"), handler)
 */
export const requireFeature = (featureName) => async (req, res, next) => {
  try {
    if (canBypass(req.user?.email)) {
      req.log?.info?.({ event: "paywall.bypass", email: req.user.email, feature: featureName, requestId: req.requestId });
      return next();
    }

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
 * Bypass: sets req.entitlements to PRO-equivalent features (non-prod only).
 *
 * Usage:
 *   router.get("/trend", attachEntitlements, handler)
 *   // then in handler: req.entitlements.analytics_months_max
 */
export const attachEntitlements = async (req, res, next) => {
  try {
    if (canBypass(req.user?.email)) {
      req.entitlements = BYPASS_FEATURES;
      return next();
    }

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
 * Bypass: skipped entirely when PAYWALL_BYPASS_ENABLED=true (non-prod only)
 * and the user's email is in PAYWALL_BYPASS_EMAILS.
 *
 * Usage:
 *   router.post("/forecasts/recompute", requireActiveTrialOrPaidPlan, handler)
 */
export const requireActiveTrialOrPaidPlan = async (req, res, next) => {
  try {
    if (canBypass(req.user?.email)) {
      req.log?.info?.({ event: "paywall.bypass", email: req.user.email, requestId: req.requestId });
      return next();
    }

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
