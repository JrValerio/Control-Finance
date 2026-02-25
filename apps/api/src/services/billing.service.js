import { dbQuery } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const DEFAULT_PAST_DUE_GRACE_DAYS = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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

const parsePositiveInteger = (value, fallbackValue) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
};

const getPastDueGraceDays = () =>
  parsePositiveInteger(
    process.env.BILLING_PAST_DUE_GRACE_DAYS,
    DEFAULT_PAST_DUE_GRACE_DAYS,
  );

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  return value.toISOString();
};

const isFutureDate = (value, now = new Date()) => {
  const parsed = toDateOrNull(value);
  if (!parsed) return false;
  return parsed.getTime() > now.getTime();
};

const addDays = (date, days) => new Date(date.getTime() + days * MILLISECONDS_PER_DAY);

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

const getCurrentSubscriptionForEntitlement = async (userId) => {
  const result = await dbQuery(
    `
      SELECT
        p.name          AS plan,
        p.display_name  AS "displayName",
        p.features,
        s.status,
        s.current_period_end AS "currentPeriodEnd",
        s.cancel_at_period_end AS "cancelAtPeriodEnd",
        s.updated_at AS "updatedAt"
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY
        CASE s.status
          WHEN 'active' THEN 1
          WHEN 'trialing' THEN 2
          WHEN 'past_due' THEN 3
          ELSE 4
        END,
        COALESCE(s.updated_at, s.created_at) DESC,
        s.id DESC
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
};

const getUserBillingDates = async (userId) => {
  const result = await dbQuery(
    `SELECT trial_ends_at AS "trialEndsAt", pro_expires_at AS "proExpiresAt"
      FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

/**
 * Resolves effective entitlement for a user.
 * Priority order:
 *  1. recurring active/trialing
 *  2. recurring past_due within grace window
 *  3. prepaid active (pro_expires_at)
 *  4. active trial
 *  5. free
 */
export const resolveEntitlement = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const now = new Date();

  const activeSubscription = await getCurrentSubscriptionForEntitlement(
    normalizedUserId,
  );
  const userBillingDates = await getUserBillingDates(normalizedUserId);

  const trialEndsAt = toDateOrNull(userBillingDates?.trialEndsAt ?? null);
  const proExpiresAt = toDateOrNull(userBillingDates?.proExpiresAt ?? null);

  let pastDueContext = null;

  if (activeSubscription?.status === "active" || activeSubscription?.status === "trialing") {
    return {
      plan: "pro",
      source: "recurring",
      subscriptionStatus: activeSubscription.status,
      trialEndsAt: null,
      proExpiresAt: null,
      graceEndsAt: null,
      subscription: activeSubscription,
    };
  }

  if (activeSubscription?.status === "past_due") {
    const graceDays = getPastDueGraceDays();
    const referenceDate = toDateOrNull(activeSubscription.updatedAt) ?? now;
    const graceEndsAt = addDays(referenceDate, graceDays);

    if (now.getTime() <= graceEndsAt.getTime()) {
      return {
        plan: "pro",
        source: "recurring_grace",
        subscriptionStatus: "past_due",
        trialEndsAt: null,
        proExpiresAt: null,
        graceEndsAt,
        subscription: activeSubscription,
      };
    }

    pastDueContext = {
      subscriptionStatus: "past_due",
      graceEndsAt,
      subscription: activeSubscription,
    };
  }

  if (isFutureDate(proExpiresAt, now)) {
    return {
      plan: "pro",
      source: "prepaid",
      subscriptionStatus: pastDueContext?.subscriptionStatus ?? null,
      trialEndsAt: null,
      proExpiresAt,
      graceEndsAt: pastDueContext?.graceEndsAt ?? null,
      subscription: pastDueContext?.subscription ?? null,
    };
  }

  if (isFutureDate(trialEndsAt, now)) {
    return {
      plan: "trial",
      source: "trial",
      subscriptionStatus: pastDueContext?.subscriptionStatus ?? null,
      trialEndsAt,
      proExpiresAt: null,
      graceEndsAt: pastDueContext?.graceEndsAt ?? null,
      subscription: pastDueContext?.subscription ?? null,
    };
  }

  return {
    plan: "free",
    source: "none",
    subscriptionStatus: pastDueContext?.subscriptionStatus ?? null,
    trialEndsAt: null,
    proExpiresAt: null,
    graceEndsAt: pastDueContext?.graceEndsAt ?? null,
    subscription: pastDueContext?.subscription ?? null,
  };
};

/**
 * Returns the active plan features for a user.
 */
export const getActivePlanFeaturesForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const entitlement = await resolveEntitlement(normalizedUserId);

  if (entitlement.plan === "pro") {
    if (
      entitlement.source === "recurring" ||
      entitlement.source === "recurring_grace"
    ) {
      if (entitlement.subscription?.features) {
        return entitlement.subscription.features;
      }
    }

    const proPlan = await getProPlan();
    return proPlan.features;
  }

  if (entitlement.plan === "trial") {
    return TRIAL_FEATURES;
  }

  const freePlan = await getFreePlan();
  return freePlan.features;
};

/**
 * Returns a summary of the user's current subscription for the /billing/subscription endpoint.
 */
export const getSubscriptionSummaryForUser = async (userId) => {
  const entitlement = await resolveEntitlement(userId);

  if (
    entitlement.plan === "pro" &&
    (entitlement.source === "recurring" || entitlement.source === "recurring_grace")
  ) {
    const row = entitlement.subscription;
    const entitlementSource =
      entitlement.source === "recurring_grace"
        ? "subscription_grace"
        : "subscription";

    if (!row) {
      const proPlan = await getProPlan();
      return {
        plan: proPlan.name,
        displayName: proPlan.displayName,
        features: proPlan.features,
        subscription: {
          status: "active",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
        entitlementSource,
        graceEndsAt: toIsoOrNull(entitlement.graceEndsAt),
      };
    }

    return {
      plan: row.plan,
      displayName: row.displayName,
      features: row.features,
      subscription: {
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      },
      entitlementSource,
      graceEndsAt: toIsoOrNull(entitlement.graceEndsAt),
    };
  }

  if (entitlement.plan === "pro" && entitlement.source === "prepaid") {
    const proPlan = await getProPlan();
    return {
      plan: proPlan.name,
      displayName: proPlan.displayName,
      features: proPlan.features,
      subscription: {
        status: "prepaid_active",
        currentPeriodEnd: toIsoOrNull(entitlement.proExpiresAt),
        cancelAtPeriodEnd: true,
      },
      entitlementSource: "prepaid",
      proExpiresAt: toIsoOrNull(entitlement.proExpiresAt),
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
  const entitlement = await resolveEntitlement(userId);

  return {
    plan: entitlement.plan,
    source: entitlement.source,
    subscriptionStatus: entitlement.subscriptionStatus,
    proExpiresAt: toIsoOrNull(entitlement.proExpiresAt),
    trialEndsAt: toIsoOrNull(entitlement.trialEndsAt),
    graceEndsAt: toIsoOrNull(entitlement.graceEndsAt),
  };
};
