import Stripe from "stripe";
import { dbQuery } from "../db/index.js";

const DEFAULT_PREPAID_AMOUNT_CENTS = 1990;
const DEFAULT_PREPAID_MONTHS = 6;
const DEFAULT_PREPAID_PRODUCT_NAME = "Control Finance PRO (6 meses pre-pago)";

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

const resolvePrepaidAmountCents = () =>
  parsePositiveIntegerEnv(
    process.env.STRIPE_PREPAID_PRO_AMOUNT_CENTS,
    DEFAULT_PREPAID_AMOUNT_CENTS,
  );

const resolvePrepaidDurationMonths = () =>
  parsePositiveIntegerEnv(
    process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS,
    DEFAULT_PREPAID_MONTHS,
  );

const resolvePrepaidProductName = () => {
  const configuredName = process.env.STRIPE_PREPAID_PRO_PRODUCT_NAME;
  if (typeof configuredName !== "string" || !configuredName.trim()) {
    return DEFAULT_PREPAID_PRODUCT_NAME;
  }

  return configuredName.trim();
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

  const amountCents = resolvePrepaidAmountCents();
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw createError(
      500,
      "Invalid prepaid amount configuration.",
      "BILLING_PREPAID_AMOUNT_INVALID",
    );
  }

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

  const productName = resolvePrepaidProductName();

  const stripe = new Stripe(secretKey, { apiVersion: "2026-01-28.clover" });

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      automatic_payment_methods: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: { name: productName },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(userId),
        entitlement: "pro_6_months",
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
