import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { attachEntitlements } from "../middlewares/entitlement.middleware.js";
import {
  addConsignacaoForUser,
  deleteConsignacaoForUser,
  getSalaryProfileForUser,
  upsertSalaryProfileForUser,
} from "../services/salary-profile.service.js";

const router = Router();

router.use(authMiddleware);

// Only the annual projection is paywalled; monthly breakdown and
// beneficiary consignacao details remain visible on the free plan.
const applyAnnualGate = (profile, hasAnnualAccess) => {
  if (hasAnnualAccess) return profile;
  return {
    ...profile,
    calculation: {
      ...profile.calculation,
      netAnnual: null,
      taxAnnual: null,
    },
  };
};

router.get("/profile", attachEntitlements, async (req, res, next) => {
  try {
    const profile = await getSalaryProfileForUser(req.user.id);
    const hasAnnual = req.entitlements?.salary_annual !== false;
    res.status(200).json(applyAnnualGate(profile, hasAnnual));
  } catch (error) {
    next(error);
  }
});

router.put("/profile", attachEntitlements, async (req, res, next) => {
  try {
    const profile = await upsertSalaryProfileForUser(req.user.id, req.body || {});
    const hasAnnual = req.entitlements?.salary_annual !== false;
    res.status(200).json(applyAnnualGate(profile, hasAnnual));
  } catch (error) {
    next(error);
  }
});

router.post("/consignacoes", async (req, res, next) => {
  try {
    const consignacao = await addConsignacaoForUser(req.user.id, req.body || {});
    res.status(201).json(consignacao);
  } catch (error) {
    next(error);
  }
});

router.delete("/consignacoes/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    await deleteConsignacaoForUser(req.user.id, id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
