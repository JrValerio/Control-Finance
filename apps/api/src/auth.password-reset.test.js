import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { setupTestDb } from "./test-helpers.js";

describe("auth — password reset", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetWriteRateLimiterState();
    await dbQuery("DELETE FROM password_reset_tokens");
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM users");
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const registerUser = async (email = "user@test.dev", password = "Senha123") => {
    await request(app).post("/auth/register").send({ email, password });
  };

  const requestReset = (email) =>
    request(app).post("/auth/forgot-password").send({ email });

  const getRawTokenForEmail = async (email) => {
    // Read the token hash from the DB, then look up the raw token via the
    // service. Since we store only the hash, we instead call the forgot-password
    // endpoint and intercept the raw token by reading the DB row + matching via
    // the fact that there's only one active token per user in tests.
    // Strategy: call requestPasswordReset directly through the service layer.
    const { requestPasswordReset } = await import("./services/auth.service.js");
    const result = await requestPasswordReset({ email });
    return result?.rawToken ?? null;
  };

  // ─── POST /auth/forgot-password ───────────────────────────────────────────────

  it("retorna 200 para email registrado (resposta neutra)", async () => {
    await registerUser();
    const res = await requestReset("user@test.dev");
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it("retorna 200 para email nao registrado (resposta neutra)", async () => {
    const res = await requestReset("naoexiste@test.dev");
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it("retorna 400 quando email nao enviado", async () => {
    const res = await request(app).post("/auth/forgot-password").send({});
    expect(res.status).toBe(400);
  });

  it("armazena token como hash na tabela password_reset_tokens", async () => {
    await registerUser();
    await requestReset("user@test.dev");

    const result = await dbQuery(
      "SELECT * FROM password_reset_tokens WHERE used_at IS NULL ORDER BY created_at DESC LIMIT 1",
    );
    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.token_hash).toHaveLength(64); // SHA-256 hex
    expect(row.used_at).toBeNull();
    expect(new Date(row.expires_at) > new Date()).toBe(true);
  });

  it("nova solicitacao invalida token ativo anterior", async () => {
    await registerUser();
    await requestReset("user@test.dev");
    await requestReset("user@test.dev");

    const result = await dbQuery(
      "SELECT * FROM password_reset_tokens ORDER BY created_at ASC",
    );
    expect(result.rows.length).toBe(2);
    const [first, second] = result.rows;
    // First token must be marked used
    expect(first.used_at).not.toBeNull();
    // Second token is still active
    expect(second.used_at).toBeNull();
  });

  // ─── POST /auth/reset-password ────────────────────────────────────────────────

  it("altera a senha com token valido", async () => {
    await registerUser("user@test.dev", "Senha123");
    const rawToken = await getRawTokenForEmail("user@test.dev");

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    expect(res.status).toBe(200);
  });

  it("senha antiga nao funciona apos reset", async () => {
    await registerUser("user@test.dev", "Senha123");
    const rawToken = await getRawTokenForEmail("user@test.dev");

    await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    const loginOld = await request(app)
      .post("/auth/login")
      .send({ email: "user@test.dev", password: "Senha123" });

    expect(loginOld.status).toBe(401);
  });

  it("nova senha funciona apos reset", async () => {
    await registerUser("user@test.dev", "Senha123");
    const rawToken = await getRawTokenForEmail("user@test.dev");

    await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    const loginNew = await request(app)
      .post("/auth/login")
      .send({ email: "user@test.dev", password: "NovaSenha456" });

    expect(loginNew.status).toBe(200);
    expect(loginNew.body.user).toBeDefined();
  });

  it("rejeita token invalido", async () => {
    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: "tokeninvalido1234", newPassword: "NovaSenha456" });

    expect(res.status).toBe(400);
  });

  it("rejeita token ja utilizado", async () => {
    await registerUser();
    const rawToken = await getRawTokenForEmail("user@test.dev");

    await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    // Second use of same token
    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "OutraSenha789" });

    expect(res.status).toBe(400);
  });

  it("rejeita token expirado", async () => {
    await registerUser();
    const rawToken = await getRawTokenForEmail("user@test.dev");

    // Force expire the token
    await dbQuery(
      "UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE used_at IS NULL",
    );

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    expect(res.status).toBe(400);
  });

  it("rejeita senha fraca no reset", async () => {
    await registerUser();
    const rawToken = await getRawTokenForEmail("user@test.dev");

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "fraca" });

    expect(res.status).toBe(400);
  });

  it("rejeita quando newPassword nao enviado", async () => {
    await registerUser();
    const rawToken = await getRawTokenForEmail("user@test.dev");

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("rejeita quando token nao enviado", async () => {
    const res = await request(app)
      .post("/auth/reset-password")
      .send({ newPassword: "NovaSenha456" });

    expect(res.status).toBe(400);
  });

  it("revoga todos os refresh tokens ativos apos reset", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "user@test.dev", password: "Senha123" });

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "user@test.dev", password: "Senha123" });

    expect(loginRes.status).toBe(200);

    // Verify a refresh token exists and is active
    const beforeReset = await dbQuery(
      "SELECT * FROM refresh_tokens WHERE revoked_at IS NULL",
    );
    expect(beforeReset.rows.length).toBeGreaterThan(0);

    const rawToken = await getRawTokenForEmail("user@test.dev");

    await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    const afterReset = await dbQuery(
      "SELECT * FROM refresh_tokens WHERE revoked_at IS NULL",
    );
    expect(afterReset.rows.length).toBe(0);
  });

  it("marca o token como used_at apos reset bem-sucedido", async () => {
    await registerUser();
    const rawToken = await getRawTokenForEmail("user@test.dev");

    await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NovaSenha456" });

    const result = await dbQuery(
      "SELECT used_at FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1",
    );
    expect(result.rows[0].used_at).not.toBeNull();
  });
});
