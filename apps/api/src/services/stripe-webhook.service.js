import { dbQuery } from "../db/index.js";
import { logWarn } from "../observability/logger.js";

const PREPAID_PRO_ENTITLEMENT_KEYS = new Set(["pro_12_months", "pro_6_months"]);
const LEGACY_PREPAID_ENTITLEMENT_KEY = "pro_6_months";
const LEGACY_PREPAID_DURATION_MONTHS = 6;
const DEFAULT_PREPAID_DURATION_MONTHS = 12;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolvePlanId = async (stripePriceId) => {
  if (stripePriceId) {
    const result = await dbQuery(
      `SELECT id FROM plans WHERE stripe_price_id = $1 AND is_active = true LIMIT 1`,
      [stripePriceId],
    );
    if (result.rows.length > 0) return result.rows[0].id;
  }

  const fallback = await dbQuery(
    `SELECT id FROM plans WHERE name = 'pro' AND is_active = true LIMIT 1`,
  );
  if (fallback.rows.length === 0) throw createError(500, "Pro plan not found.");
  return fallback.rows[0].id;
};

const toIso = (unixTs) =>
  unixTs ? new Date(unixTs * 1000).toISOString() : null;

const parsePositiveInteger = (value, fallbackValue) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return fallbackValue;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
};

const resolvePrepaidDurationMonths = ({ entitlement, metadata }) => {
  const metadataMonths = parsePositiveInteger(
    metadata?.entitlement_months,
    NaN,
  );
  if (Number.isInteger(metadataMonths) && metadataMonths > 0) {
    return metadataMonths;
  }

  // Legacy 6-month prepaid sessions may not include entitlement_months in metadata.
  // Keep the historical behavior to avoid over-granting 12 months.
  if (entitlement === LEGACY_PREPAID_ENTITLEMENT_KEY) {
    return LEGACY_PREPAID_DURATION_MONTHS;
  }

  return parsePositiveInteger(
    process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS,
    DEFAULT_PREPAID_DURATION_MONTHS,
  );
};

const extractPrepaidGrantPayload = (session) => {
  const entitlement = session?.metadata?.entitlement;
  if (!PREPAID_PRO_ENTITLEMENT_KEYS.has(entitlement)) {
    return null;
  }

  const userId = parseInt(session?.metadata?.userId, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const checkoutSessionId =
    typeof session?.id === "string" ? session.id.trim() : "";
  if (!checkoutSessionId) {
    return null;
  }

  const months = resolvePrepaidDurationMonths({
    entitlement,
    metadata: session?.metadata,
  });
  if (!Number.isInteger(months) || months <= 0) {
    return null;
  }

  return {
    userId,
    checkoutSessionId,
    stripePaymentIntentId:
      typeof session?.payment_intent === "string"
        ? session.payment_intent
        : null,
    months,
  };
};

const grantPrepaidProEntitlement = async ({
  userId,
  checkoutSessionId,
  stripePaymentIntentId,
  months,
}) => {
  const existingGrant = await dbQuery(
    `SELECT id FROM prepaid_pro_grants WHERE stripe_checkout_session_id = $1 LIMIT 1`,
    [checkoutSessionId],
  );

  if (existingGrant.rows.length > 0) {
    return;
  }

  const insertedGrant = await dbQuery(
    `INSERT INTO prepaid_pro_grants
      (user_id, stripe_checkout_session_id, stripe_payment_intent_id, entitlement_months, granted_until)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (stripe_checkout_session_id) DO NOTHING
    RETURNING id`,
    [userId, checkoutSessionId, stripePaymentIntentId, months],
  );

  if (insertedGrant.rows.length === 0) {
    return;
  }

  const updatedUser = await dbQuery(
    `UPDATE users
      SET pro_expires_at =
        (CASE
          WHEN pro_expires_at IS NULL OR pro_expires_at < NOW() THEN NOW()
          ELSE pro_expires_at
        END) + (($2::text || ' months')::interval)
      WHERE id = $1
      RETURNING pro_expires_at`,
    [userId, months],
  );

  if (updatedUser.rows.length === 0) {
    return;
  }

  await dbQuery(
    `UPDATE prepaid_pro_grants
      SET granted_until = $2
      WHERE id = $1`,
    [insertedGrant.rows[0].id, updatedUser.rows[0].pro_expires_at],
  );
};

/**
 * Upserts a subscription row, avoiding partial-unique-index violations.
 *
 * Priority order:
 *  1. Update by stripe_subscription_id (existing row)
 *  2. Update active/trialing/past_due row for user_id (plan-change mid-cycle)
 *  3. Insert new row
 */
const upsertSubscriptionForUser = async ({
  userId,
  planId,
  status,
  stripeCustomerId,
  stripeSubscriptionId,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}) => {
  const bySubId = await dbQuery(
    `SELECT id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1`,
    [stripeSubscriptionId],
  );

  if (bySubId.rows.length > 0) {
    await dbQuery(
      `UPDATE subscriptions SET
        plan_id = $2,
        status = $3,
        stripe_customer_id = $4,
        current_period_start = $5,
        current_period_end = $6,
        cancel_at_period_end = $7,
        updated_at = NOW()
       WHERE id = $1`,
      [
        bySubId.rows[0].id,
        planId,
        status,
        stripeCustomerId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd ?? false,
      ],
    );
    return;
  }

  const byUserId = await dbQuery(
    `SELECT id FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1`,
    [userId],
  );

  if (byUserId.rows.length > 0) {
    await dbQuery(
      `UPDATE subscriptions SET
        plan_id = $2,
        status = $3,
        stripe_customer_id = $4,
        stripe_subscription_id = $5,
        current_period_start = $6,
        current_period_end = $7,
        cancel_at_period_end = $8,
        updated_at = NOW()
       WHERE id = $1`,
      [
        byUserId.rows[0].id,
        planId,
        status,
        stripeCustomerId,
        stripeSubscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd ?? false,
      ],
    );
    return;
  }

  await dbQuery(
    `INSERT INTO subscriptions
       (user_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      planId,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd ?? false,
    ],
  );
};

export const handleCheckoutSessionCompleted = async (session) => {
  const prepaidPayload = extractPrepaidGrantPayload(session);
  if (prepaidPayload) {
    if (session?.payment_status === "paid") {
      await grantPrepaidProEntitlement(prepaidPayload);
    }
    return;
  }

  const userId = parseInt(session?.metadata?.userId, 10);
  if (!Number.isInteger(userId) || userId <= 0) return;

  const stripeCustomerId = session?.customer ?? null;
  const stripeSubscriptionId = session?.subscription ?? null;
  if (!stripeCustomerId || !stripeSubscriptionId) return;

  const stripePriceId = session?.metadata?.stripe_price_id ?? null;
  const planId = await resolvePlanId(stripePriceId);

  await upsertSubscriptionForUser({
    userId,
    planId,
    status: "active",
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
};

export const handleCheckoutSessionAsyncPaymentSucceeded = async (session) => {
  const prepaidPayload = extractPrepaidGrantPayload(session);
  if (!prepaidPayload) {
    return;
  }

  await grantPrepaidProEntitlement(prepaidPayload);
};

export const handleSubscriptionUpserted = async (subscription) => {
  const stripeSubscriptionId = subscription?.id ?? null;
  const stripeCustomerId = subscription?.customer ?? null;
  if (!stripeSubscriptionId) return;

  const status = subscription?.status ?? "active";
  const currentPeriodStart = toIso(subscription?.current_period_start);
  const currentPeriodEnd = toIso(subscription?.current_period_end);
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;
  const stripePriceId = subscription?.items?.data?.[0]?.price?.id ?? null;

  // Find existing row by stripe_subscription_id
  const bySubId = await dbQuery(
    `SELECT id, user_id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1`,
    [stripeSubscriptionId],
  );

  if (bySubId.rows.length > 0) {
    const planId = await resolvePlanId(stripePriceId);
    await dbQuery(
      `UPDATE subscriptions SET
        plan_id = $2,
        status = $3,
        stripe_customer_id = $4,
        current_period_start = $5,
        current_period_end = $6,
        cancel_at_period_end = $7,
        updated_at = NOW()
       WHERE id = $1`,
      [
        bySubId.rows[0].id,
        planId,
        status,
        stripeCustomerId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      ],
    );
    return;
  }

  // Try to find existing active row by stripe_customer_id
  if (stripeCustomerId) {
    const byCustomer = await dbQuery(
      `SELECT id, user_id FROM subscriptions
        WHERE stripe_customer_id = $1 AND status IN ('active', 'trialing', 'past_due')
        LIMIT 1`,
      [stripeCustomerId],
    );

    if (byCustomer.rows.length > 0) {
      const planId = await resolvePlanId(stripePriceId);
      await dbQuery(
        `UPDATE subscriptions SET
          plan_id = $2,
          status = $3,
          stripe_subscription_id = $4,
          current_period_start = $5,
          current_period_end = $6,
          cancel_at_period_end = $7,
          updated_at = NOW()
         WHERE id = $1`,
        [
          byCustomer.rows[0].id,
          planId,
          status,
          stripeSubscriptionId,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd,
        ],
      );
      return;
    }
  }

  // Unknown subscription — no user linkage available, skip
};

export const handleSubscriptionDeleted = async (subscription) => {
  const stripeSubscriptionId = subscription?.id ?? null;
  if (!stripeSubscriptionId) return;

  await dbQuery(
    `UPDATE subscriptions SET
      status = 'canceled',
      cancel_at_period_end = false,
      updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId],
  );
};

export const handleInvoicePaymentFailed = async (invoice) => {
  const stripeSubscriptionId = invoice?.subscription ?? null;
  if (!stripeSubscriptionId) return;

  await dbQuery(
    `UPDATE subscriptions SET
      status = 'past_due',
      updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId],
  );
};

const markStripeEventProcessed = async (stripeEventId, eventType) => {
  if (!stripeEventId) return false;

  const existing = await dbQuery(
    `SELECT id FROM stripe_events WHERE stripe_event_id = $1 LIMIT 1`,
    [stripeEventId],
  );
  if (existing.rows.length > 0) return true;

  const inserted = await dbQuery(
    `INSERT INTO stripe_events (stripe_event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING id`,
    [stripeEventId, eventType ?? "unknown"],
  );
  // Empty RETURNING means a concurrent request won the race — treat as duplicate
  return inserted.rows.length === 0;
};

export const processStripeEvent = async (event) => {
  const alreadyProcessed = await markStripeEventProcessed(event?.id, event?.type);
  if (alreadyProcessed) return;

  switch (event?.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(event.data?.object);
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutSessionAsyncPaymentSucceeded(event.data?.object);
    case "checkout.session.async_payment_failed":
      // Payment failed asynchronously (e.g., boleto expiration).
      return;
    case "customer.subscription.updated":
    case "customer.subscription.created":
      return handleSubscriptionUpserted(event.data?.object);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data?.object);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data?.object);
    default:
      logWarn({
        event: "stripe.webhook.unhandled_event",
        message: "Received a Stripe event with no registered handler.",
        stripeEventType: event?.type ?? "unknown",
        stripeEventId: event?.id ?? "unknown",
      });
      break;
  }
};
