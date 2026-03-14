import { verifyAuthToken } from "../services/auth.service.js";

const createUnauthorizedResponse = (req, message) => ({
  message,
  requestId: req.requestId || null,
});

export const authMiddleware = (req, res, next) => {
  // Priority 1: httpOnly cookie (browser sessions)
  const cookieToken = req.cookies?.cf_access;

  // Priority 2: Authorization Bearer fallback (tests, Postman, scripts)
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    return res
      .status(401)
      .json(createUnauthorizedResponse(req, "Token de autenticacao ausente ou invalido."));
  }

  try {
    const payload = verifyAuthToken(token);

    req.user = {
      id: Number(payload.sub),
      email: payload.email,
    };

    return next();
  } catch {
    return res
      .status(401)
      .json(createUnauthorizedResponse(req, "Token invalido ou expirado."));
  }
};
