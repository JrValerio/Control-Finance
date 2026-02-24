import { dbQuery } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// Features available during an active trial.
// csv_import/export remain PRO-only; analytics cap is set to 6 months.
const TRIAL_FEATURES = {
  csv_import: false,
  csv_export: false,
  analytics_months_max: 6,
  budget_tracking: true,
  salary_annual: true,
};

const normalizeUserId = (value) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }

  return parsed;
};

/**
 * Returns the active plan features for a user.
 * If no active/trialing/past_due subscription exists, falls back to the free plan.
 */
export const getActivePlanFeaturesForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const subscriptionResult = await dbQuery(
    `
      SELECT p.features
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    `,
    [normalizedUserId],
  );

  if (subscriptionResult.rows.length > 0) {
    return subscriptionResult.rows[0].features;
  }

  // Check for an active trial
  const trialResult = await dbQuery(
    `SELECT trial_ends_at FROM users WHERE id = $1 LIMIT 1`,
    [normalizedUserId],
  );
  const trialEndsAt =
    trialResult.rows.length > 0 ? trialResult.rows[0].trial_ends_at : null;

  if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
    return TRIAL_FEATURES;
  }

  const freePlanResult = await dbQuery(
    `SELECT features FROM plans WHERE name = 'free' AND is_active = true LIMIT 1`,
  );

  if (freePlanResult.rows.length === 0) {
    throw createError(500, "Plano gratuito nao encontrado.");
  }

  return freePlanResult.rows[0].features;
};

/**
 * Returns a summary of the user's current subscription for the /billing/subscription endpoint.
 */
export const getSubscriptionSummaryForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const result = await dbQuery(
    `
      SELECT
        p.name          AS plan,
        p.display_name  AS "displayName",
        p.features,
        s.status,
        s.current_period_end AS "currentPeriodEnd",
        s.cancel_at_period_end AS "cancelAtPeriodEnd"
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    `,
    [normalizedUserId],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];

    return {
      plan: row.plan,
      displayName: row.displayName,
      features: row.features,
      subscription: {
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      },
    };
  }

  const freePlanResult = await dbQuery(
    `SELECT name, display_name AS "displayName", features FROM plans WHERE name = 'free' AND is_active = true LIMIT 1`,
  );

  if (freePlanResult.rows.length === 0) {
    throw createError(500, "Plano gratuito nao encontrado.");
  }

  const freePlan = freePlanResult.rows[0];

  return {
    plan: freePlan.name,
    displayName: freePlan.displayName,
    features: freePlan.features,
    subscription: null,
  };
};
