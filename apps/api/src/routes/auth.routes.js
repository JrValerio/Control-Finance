import { Router } from "express";
import {
  loginUser,
  registerUser,
  loginOrRegisterWithGoogle,
  setUserPassword,
  linkGoogleIdentity,
  issueAuthToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  randomUUID,
} from "../services/auth.service.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  bruteForceLoginGuard,
  clearLoginFailures,
  loginRateLimiter,
  registerLoginFailure,
} from "../middlewares/login-protection.middleware.js";

const router = Router();

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

const getRefreshMaxAgeMs = () =>
  parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30", 10) *
  24 * 60 * 60 * 1000;

const buildCookieOptions = (path) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

const setAuthCookies = (res, accessToken, rawRefreshToken) => {
  res.cookie("cf_access", accessToken, {
    ...buildCookieOptions("/"),
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie("cf_refresh", rawRefreshToken, {
    ...buildCookieOptions("/auth"),
    maxAge: getRefreshMaxAgeMs(),
  });
};

const clearAuthCookies = (res) => {
  res.cookie("cf_access", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookie("cf_refresh", "", { httpOnly: true, maxAge: 0, path: "/auth" });
};

const issueSessionCookies = async (res, user, req) => {
  const familyId = randomUUID();
  const accessToken = issueAuthToken(user);
  const rawRefreshToken = await issueRefreshToken(user.id, familyId, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });
  setAuthCookies(res, accessToken, rawRefreshToken);
};

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/register", async (req, res, next) => {
  try {
    const { user } = await registerUser(req.body || {});
    await issueSessionCookies(res, user, req);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginRateLimiter, bruteForceLoginGuard, async (req, res, next) => {
  try {
    const { user } = await loginUser(req.body || {});
    clearLoginFailures(req);
    await issueSessionCookies(res, user, req);
    res.status(200).json({ user });
  } catch (error) {
    if (error.status === 401) {
      registerLoginFailure(req);
    }
    next(error);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const { user } = await loginOrRegisterWithGoogle(req.body || {});
    await issueSessionCookies(res, user, req);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  const rawToken = req.cookies?.cf_refresh;

  if (!rawToken) {
    return res.status(401).json({ message: "Sessao expirada." });
  }

  try {
    const { user, rawRefreshToken } = await rotateRefreshToken(rawToken, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const accessToken = issueAuthToken(user);
    setAuthCookies(res, accessToken, rawRefreshToken);
    return res.status(200).json({ user });
  } catch (error) {
    if (error.status === 401) {
      clearAuthCookies(res);
    }
    next(error);
  }
});

router.delete("/logout", async (req, res) => {
  const rawToken = req.cookies?.cf_refresh;

  if (rawToken) {
    try {
      await revokeRefreshToken(rawToken);
    } catch {
      // Best-effort revocation — always clear cookies and succeed
    }
  }

  clearAuthCookies(res);
  return res.status(204).send();
});

router.patch("/password", authMiddleware, async (req, res, next) => {
  try {
    await setUserPassword({
      userId: req.user.id,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });
    res.status(200).json({ message: "Senha atualizada com sucesso." });
  } catch (error) {
    next(error);
  }
});

router.post("/google/link", authMiddleware, async (req, res, next) => {
  try {
    await linkGoogleIdentity({
      userId: req.user.id,
      idToken: req.body?.idToken,
    });
    res.status(200).json({ message: "Conta Google vinculada com sucesso." });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authMiddleware, (req, res) => {
  res.status(200).json({ id: req.user.id, email: req.user.email });
});

export default router;
