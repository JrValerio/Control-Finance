import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { attachEntitlements } from "../middlewares/entitlement.middleware.js";
import {
  getSalaryProfileForUser,
  upsertSalaryProfileForUser,
} from "../services/salary-profile.service.js";

const router = Router();

router.use(authMiddleware);

// Returns the profile with annual fields nulled out for free users.
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

export default router;
