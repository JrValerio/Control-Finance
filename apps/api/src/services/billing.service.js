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

const getFreePlan = async () => {
  const result = await dbQuery(
    `SELECT name, display_name AS "displayName", features
      FROM plans
      WHERE name = 'free' AND is_active = true
      LIMIT 1`,
  );

  if (result.rows.length === 0) {
    throw createError(500, "Plano gratuito nao encontrado.");
  }

  return result.rows[0];
};

const getProPlan = async () => {
  const result = await dbQuery(
    `SELECT name, display_name AS "displayName", features
      FROM plans
      WHERE name = 'pro' AND is_active = true
      LIMIT 1`,
  );

  if (result.rows.length === 0) {
    throw createError(500, "Plano Pro nao encontrado.");
  }

  return result.rows[0];
};

const getActivePaidSubscriptionSummary = async (userId) => {
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
    [userId],
  );

  return result.rows[0] ?? null;
};

const getActiveTrialEndsAtForUser = async (userId) => {
  const trialResult = await dbQuery(
    `SELECT trial_ends_at FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const trialEndsAt =
    trialResult.rows.length > 0 ? trialResult.rows[0].trial_ends_at : null;

  if (!trialEndsAt) {
    return null;
  }

  if (new Date(trialEndsAt) <= new Date()) {
    return null;
  }

  return trialEndsAt;
};

const getActivePrepaidProExpiresAtForUser = async (userId) => {
  const result = await dbQuery(
    `SELECT pro_expires_at
      FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const proExpiresAt = result.rows[0].pro_expires_at;
  if (!proExpiresAt) {
    return null;
  }

  if (new Date(proExpiresAt) <= new Date()) {
    return null;
  }

  return proExpiresAt;
};

/**
 * Returns the active plan features for a user.
 * Priority order:
 *  1. Active recurring subscription
 *  2. Active prepaid PRO entitlement (users.pro_expires_at)
 *  3. Active trial
 *  4. Free plan
 */
export const getActivePlanFeaturesForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const activeSubscription = await getActivePaidSubscriptionSummary(
    normalizedUserId,
  );
  if (activeSubscription) {
    return activeSubscription.features;
  }

  const prepaidProExpiresAt =
    await getActivePrepaidProExpiresAtForUser(normalizedUserId);
  if (prepaidProExpiresAt) {
    const proPlan = await getProPlan();
    return proPlan.features;
  }

  const trialEndsAt = await getActiveTrialEndsAtForUser(normalizedUserId);
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
    return TRIAL_FEATURES;
  }

  const freePlan = await getFreePlan();
  return freePlan.features;
};

/**
 * Returns a summary of the user's current subscription for the /billing/subscription endpoint.
 */
export const getSubscriptionSummaryForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const activeSubscription = await getActivePaidSubscriptionSummary(
    normalizedUserId,
  );

  if (activeSubscription) {
    const row = activeSubscription;

    return {
      plan: row.plan,
      displayName: row.displayName,
      features: row.features,
      subscription: {
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      },
      entitlementSource: "subscription",
    };
  }

  const prepaidProExpiresAt =
    await getActivePrepaidProExpiresAtForUser(normalizedUserId);
  if (prepaidProExpiresAt) {
    const proPlan = await getProPlan();
    return {
      plan: proPlan.name,
      displayName: proPlan.displayName,
      features: proPlan.features,
      subscription: {
        status: "prepaid_active",
        currentPeriodEnd: prepaidProExpiresAt,
        cancelAtPeriodEnd: true,
      },
      entitlementSource: "prepaid",
      proExpiresAt: prepaidProExpiresAt,
    };
  }

  const freePlan = await getFreePlan();

  return {
    plan: freePlan.name,
    displayName: freePlan.displayName,
    features: freePlan.features,
    subscription: null,
    entitlementSource: "free",
    proExpiresAt: null,
  };
};

/**
 * Returns the user's effective entitlement source.
 */
export const getEntitlementSummaryForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const activeSubscription = await getActivePaidSubscriptionSummary(
    normalizedUserId,
  );

  if (activeSubscription) {
    return {
      plan: activeSubscription.plan,
      source: "subscription",
      proExpiresAt: null,
      trialEndsAt: null,
    };
  }

  const prepaidProExpiresAt =
    await getActivePrepaidProExpiresAtForUser(normalizedUserId);
  if (prepaidProExpiresAt) {
    return {
      plan: "pro",
      source: "prepaid",
      proExpiresAt: prepaidProExpiresAt,
      trialEndsAt: null,
    };
  }

  const trialEndsAt = await getActiveTrialEndsAtForUser(normalizedUserId);
  if (trialEndsAt) {
    return {
      plan: "free",
      source: "trial",
      proExpiresAt: null,
      trialEndsAt,
    };
  }

  return {
    plan: "free",
    source: "free",
    proExpiresAt: null,
    trialEndsAt: null,
  };
};
