import Stripe from "stripe";
import { dbQuery } from "../db/index.js";

const PREPAID_YEAR_PRICE_ENV_KEY = "STRIPE_PRICE_ID_PRO_PREPAID_YEAR";
const PREPAID_YEAR_ENTITLEMENT = "pro_12_months";
const DEFAULT_PREPAID_MONTHS = 12;

const createError = (status, message, publicCode = "") => {
  const error = new Error(message);
  error.status = status;
  if (typeof publicCode === "string" && publicCode.trim()) {
    error.publicCode = publicCode.trim();
  }
  return error;
};

const parsePositiveIntegerEnv = (rawValue, fallbackValue) => {
  const normalizedValue = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!normalizedValue) return fallbackValue;

  const parsedValue = Number(normalizedValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return NaN;
  }

  return parsedValue;
};

const isValidStripePriceId = (value) =>
  typeof value === "string" && value.trim().startsWith("price_");

const resolvePrepaidDurationMonths = () =>
  parsePositiveIntegerEnv(
    process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS,
    DEFAULT_PREPAID_MONTHS,
  );

const resolvePrepaidYearPriceId = () => {
  const priceId = process.env[PREPAID_YEAR_PRICE_ENV_KEY];
  if (!priceId || !priceId.trim()) {
    throw createError(
      500,
      "Prepaid yearly price not configured.",
      "BILLING_PREPAID_YEAR_PRICE_NOT_CONFIGURED",
    );
  }

  if (!isValidStripePriceId(priceId)) {
    throw createError(
      500,
      `Invalid Stripe price ID configured in ${PREPAID_YEAR_PRICE_ENV_KEY}.`,
      "BILLING_PREPAID_YEAR_PRICE_INVALID",
    );
  }

  return priceId.trim();
};

const hasActiveRecurringSubscription = async (userId) => {
  const result = await dbQuery(
    `SELECT id FROM subscriptions
      WHERE user_id = $1
        AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1`,
    [userId],
  );

  return result.rows.length > 0;
};

export const createPrepaidCheckoutSession = async ({ userId, userEmail }) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw createError(500, "Stripe secret key not configured.", "BILLING_STRIPE_SECRET_MISSING");
  }

  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL;
  if (!successUrl || !cancelUrl) {
    throw createError(
      500,
      "Checkout URLs not configured.",
      "BILLING_CHECKOUT_URLS_NOT_CONFIGURED",
    );
  }

  const prepaidYearPriceId = resolvePrepaidYearPriceId();

  const durationMonths = resolvePrepaidDurationMonths();
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    throw createError(
      500,
      "Invalid prepaid duration configuration.",
      "BILLING_PREPAID_DURATION_INVALID",
    );
  }

  if (await hasActiveRecurringSubscription(userId)) {
    throw createError(
      409,
      "Voce ja possui uma assinatura recorrente ativa.",
      "BILLING_RECURRING_SUBSCRIPTION_ALREADY_ACTIVE",
    );
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2026-01-28.clover" });

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: {
        automatic_payment_methods: { enabled: true },
      },
      line_items: [{ price: prepaidYearPriceId, quantity: 1 }],
      metadata: {
        userId: String(userId),
        entitlement: PREPAID_YEAR_ENTITLEMENT,
        entitlement_months: String(durationMonths),
      },
      ...(userEmail ? { customer_email: userEmail } : {}),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });
  } catch (error) {
    const normalizedMessage =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Unknown Stripe error while creating prepaid checkout session.";

    const checkoutError = createError(
      500,
      "Stripe prepaid checkout session creation failed.",
      "BILLING_PREPAID_CHECKOUT_CREATE_FAILED",
    );
    checkoutError.internalMessage = normalizedMessage;
    throw checkoutError;
  }

  return { url: session.url };
};
