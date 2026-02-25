import Stripe from "stripe";
import { dbQuery } from "../db/index.js";

const createError = (status, message, publicCode = "") => {
  const error = new Error(message);
  error.status = status;
  if (typeof publicCode === "string" && publicCode.trim()) {
    error.publicCode = publicCode.trim();
  }
  return error;
};

const isValidStripePriceId = (value) =>
  typeof value === "string" && value.trim().startsWith("price_");

const resolveCheckoutInterval = (value) => {
  const normalizedValue =
    typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!normalizedValue) {
    return "month";
  }

  if (normalizedValue === "month" || normalizedValue === "year") {
    return normalizedValue;
  }

  throw createError(
    400,
    "interval deve ser 'month' ou 'year'.",
    "BILLING_CHECKOUT_INTERVAL_INVALID",
  );
};

const resolvePriceIdFromEnv = (envKey) => {
  const rawValue = process.env[envKey];
  if (!rawValue) {
    return "";
  }

  if (!isValidStripePriceId(rawValue)) {
    throw createError(
      500,
      `Invalid Stripe price ID configured in ${envKey}.`,
      "BILLING_PRO_PRICE_ID_INVALID",
    );
  }

  return rawValue.trim();
};

const resolveMonthlyPriceIdFromLegacyConfig = async () => {
  const dbResult = await dbQuery(
    `SELECT stripe_price_id FROM plans
      WHERE name = 'pro' AND is_active = true AND stripe_price_id IS NOT NULL
      LIMIT 1`,
  );
  if (dbResult.rows.length > 0) {
    const planPriceId = dbResult.rows[0].stripe_price_id;

    if (isValidStripePriceId(planPriceId)) {
      return planPriceId;
    }

    throw createError(
      500,
      "Invalid Stripe price ID configured for pro plan.",
      "BILLING_PRO_PRICE_ID_INVALID",
    );
  }

  const legacyPriceId = resolvePriceIdFromEnv("STRIPE_PRICE_ID_PRO");
  if (legacyPriceId) {
    return legacyPriceId;
  }

  return "";
};

const resolvePriceId = async (interval) => {
  if (interval === "month") {
    const monthlyEnvPriceId = resolvePriceIdFromEnv("STRIPE_PRICE_ID_PRO_MONTHLY");
    if (monthlyEnvPriceId) {
      return monthlyEnvPriceId;
    }

    const legacyMonthlyPriceId = await resolveMonthlyPriceIdFromLegacyConfig();
    if (legacyMonthlyPriceId) {
      return legacyMonthlyPriceId;
    }

    throw createError(
      500,
      "Monthly pro plan price not configured.",
      "BILLING_PRO_PRICE_NOT_CONFIGURED",
    );
  }

  if (interval === "year") {
    // Yearly checkout must be explicitly configured via STRIPE_PRICE_ID_PRO_YEARLY.
    // No DB or legacy env fallback to avoid silent monthly/yearly mixups.
    const yearlyEnvPriceId = resolvePriceIdFromEnv("STRIPE_PRICE_ID_PRO_YEARLY");
    if (yearlyEnvPriceId) {
      return yearlyEnvPriceId;
    }

    throw createError(
      500,
      "Yearly pro plan price not configured.",
      "BILLING_PRO_PRICE_NOT_CONFIGURED",
    );
  }

  throw createError(
    500,
    "Pro plan price not configured.",
    "BILLING_PRO_PRICE_NOT_CONFIGURED",
  );
};

export const createCheckoutSession = async ({ userId, userEmail, interval }) => {
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

  const resolvedInterval = resolveCheckoutInterval(interval);

  const existing = await dbQuery(
    `SELECT id FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) throw createError(409, "Voce ja possui uma assinatura ativa.");

  const priceId = await resolvePriceId(resolvedInterval);

  const stripe = new Stripe(secretKey, { apiVersion: "2026-01-28.clover" });

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: String(userId),
        billing_interval: resolvedInterval,
      },
      ...(userEmail ? { customer_email: userEmail } : {}),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });
  } catch (error) {
    const normalizedMessage =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Unknown Stripe error while creating checkout session.";
    const checkoutError = createError(
      500,
      "Stripe checkout session creation failed.",
      "BILLING_CHECKOUT_CREATE_FAILED",
    );
    checkoutError.internalMessage = normalizedMessage;
    throw checkoutError;
  }

  return { url: session.url };
};
