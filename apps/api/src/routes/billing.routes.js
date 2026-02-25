import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getEntitlementSummaryForUser,
  getSubscriptionSummaryForUser,
} from "../services/billing.service.js";
import { createCheckoutSession } from "../services/stripe-checkout.service.js";
import { createPrepaidCheckoutSession } from "../services/stripe-prepaid-checkout.service.js";
import { createPortalSession } from "../services/stripe-portal.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/subscription", async (req, res, next) => {
  try {
    const summary = await getSubscriptionSummaryForUser(req.user.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/entitlement", async (req, res, next) => {
  try {
    const summary = await getEntitlementSummaryForUser(req.user.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.post("/checkout", async (req, res, next) => {
  try {
    const result = await createCheckoutSession({
      userId: req.user.id,
      userEmail: req.user.email,
      interval: req.body?.interval,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/checkout-prepaid", async (req, res, next) => {
  try {
    const result = await createPrepaidCheckoutSession({
      userId: req.user.id,
      userEmail: req.user.email,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/portal", async (req, res, next) => {
  try {
    const result = await createPortalSession({ userId: req.user.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
