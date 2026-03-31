/**
 * Security headers middleware for COOP and COEP.
 *
 * Cross-Origin-Opener-Policy (COOP):
 *   - "same-origin" (default): blocks popup communication
 *   - "same-origin-allow-popups": allows OAuth popup callbacks via postMessage
 *
 * Routes:
 *   - /auth/* → "same-origin-allow-popups" (OAuth popup flow)
 *   - other routes → "same-origin" (default security posture)
 */

export const securityHeadersMiddleware = (req, res, next) => {
  // Default COOP policy: restrict popup communication for general security
  let coopPolicy = "same-origin";

  // Exception for auth routes: allow popups for OAuth callback postMessage
  const isAuthRoute = req.path.startsWith("/auth");
  if (isAuthRoute) {
    coopPolicy = "same-origin-allow-popups";
  }

  // Set COOP header
  res.setHeader("Cross-Origin-Opener-Policy", coopPolicy);

  // Set COEP header: require CORS headers on cross-origin resources
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  next();
};
