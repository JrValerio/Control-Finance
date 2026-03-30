import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { bankAccountsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  listBankAccountsByUser,
  createBankAccountForUser,
  updateBankAccountForUser,
  deleteBankAccountForUser,
} from "../services/bank-accounts.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const result = await listBankAccountsByUser(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/", bankAccountsWriteRateLimiter, async (req, res, next) => {
  try {
    const account = await createBankAccountForUser(req.user.id, req.body || {});
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", bankAccountsWriteRateLimiter, async (req, res, next) => {
  try {
    const account = await updateBankAccountForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(account);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", bankAccountsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await deleteBankAccountForUser(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
