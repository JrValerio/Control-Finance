import { describe, it, expect } from "vitest";
import { securityHeadersMiddleware } from "./middlewares/security-headers.middleware.js";

describe("PR #351: Security Headers Middleware (COOP/COEP)", () => {
  it("retorna COOP 'same-origin' para rotas normais", () => {
    const req = { path: "/some-endpoint" };
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    const next = () => {};

    securityHeadersMiddleware(req, res, next);

    expect(res.headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(res.headers["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });

  it("retorna COOP 'same-origin-allow-popups' para /auth/* routes", () => {
    const req = { path: "/auth/google" };
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    const next = () => {};

    securityHeadersMiddleware(req, res, next);

    expect(res.headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(res.headers["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });

  it("retorna COOP 'same-origin-allow-popups' para /auth/refresh", () => {
    const req = { path: "/auth/refresh" };
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    const next = () => {};

    securityHeadersMiddleware(req, res, next);

    expect(res.headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });

  it("chama next() para propagar para middleware seguinte", () => {
    const req = { path: "/auth/google" };
    const res = {
      setHeader() {},
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    securityHeadersMiddleware(req, res, next);

    expect(nextCalled).toBe(true);
  });

  it("retorna mesmo COEP para todas as rotas", () => {
    const routes = ["/auth/google", "/api/transactions", "/health", "/auth/logout"];
    
    routes.forEach(path => {
      const req = { path };
      const res = {
        headers: {},
        setHeader(name, value) {
          this.headers[name] = value;
        },
      };
      const next = () => {};

      securityHeadersMiddleware(req, res, next);

      expect(res.headers["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
    });
  });
});
