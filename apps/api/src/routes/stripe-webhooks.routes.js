import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { processStripeEvent } from "../services/stripe-webhook.service.js";

const createError = (status, message, publicCode = "") => {
  const error = new Error(message);
  error.status = status;
  if (typeof publicCode === "string" && publicCode.trim()) {
    error.publicCode = publicCode.trim();
  }
  return error;
};

const parseStripeSignatureHeader = (signatureHeader) => {
  const parts = signatureHeader
    .split(",")
    .map((p) => p.trim())
    .reduce((acc, pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return acc;
      const k = pair.slice(0, idx);
      const v = pair.slice(idx + 1);
      if (!acc[k]) acc[k] = [];
      acc[k].push(v);
      return acc;
    }, {});

  const t = parts.t?.[0];
  const v1s = parts.v1 ?? [];
  return { t, v1s };
};

const verifyStripeSignature = (rawBodyBuffer, signatureHeader, secret) => {
  const { t, v1s } = parseStripeSignatureHeader(signatureHeader);

  if (!t || v1s.length === 0) {
    throw createError(
      400,
      "Stripe signature malformed.",
      "BILLING_WEBHOOK_SIGNATURE_MALFORMED",
    );
  }

  const expectedHex = createHmac("sha256", secret)
    .update(`${t}.`)
    .update(rawBodyBuffer)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedHex, "hex");

  const ok = v1s.some((v1) => {
    if (!/^[0-9a-f]+$/i.test(v1)) return false;
    const receivedBuf = Buffer.from(v1, "hex");
    if (receivedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(receivedBuf, expectedBuf);
  });

  if (!ok) {
    throw createError(
      400,
      "Stripe signature invalid.",
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
    );
  }

  const TOLERANCE_SECONDS = 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    throw createError(
      400,
      "Stripe webhook timestamp expired.",
      "BILLING_WEBHOOK_TIMESTAMP_EXPIRED",
    );
  }
};

const router = Router();

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        return next(
          createError(
            500,
            "Stripe webhook secret missing.",
            "BILLING_WEBHOOK_SECRET_MISSING",
          ),
        );
      }

      const sig = req.headers["stripe-signature"];
      if (!sig) {
        return next(
          createError(
            400,
            "Missing Stripe-Signature header.",
            "BILLING_WEBHOOK_SIGNATURE_MISSING",
          ),
        );
      }

      verifyStripeSignature(req.body, sig, secret);

      const event = JSON.parse(req.body.toString("utf8"));
      await processStripeEvent(event);

      return res.status(200).json({ received: true });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
