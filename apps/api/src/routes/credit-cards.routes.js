import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { creditCardsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  listCreditCardsByUser,
  createCreditCardForUser,
  updateCreditCardForUser,
  createCreditCardPurchaseForUser,
  deleteCreditCardPurchaseForUser,
  closeCreditCardInvoiceForUser,
} from "../services/credit-cards.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const result = await listCreditCardsByUser(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const card = await createCreditCardForUser(req.user.id, req.body || {});
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const card = await updateCreditCardForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(card);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/purchases", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const purchase = await createCreditCardPurchaseForUser(req.user.id, req.params.id, req.body || {});
    res.status(201).json(purchase);
  } catch (error) {
    next(error);
  }
});

router.delete("/purchases/:purchaseId", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteCreditCardPurchaseForUser(req.user.id, req.params.purchaseId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/close-invoice", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await closeCreditCardInvoiceForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
