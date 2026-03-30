import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { registerAndLogin, setupTestDb } from "./test-helpers.js";
import { scoreBillTransactionMatch } from "./services/reconciliation.service.js";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const offsetDate = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createBill = (token, overrides = {}) =>
  request(app)
    .post("/bills")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Energia ENEL", amount: 200, dueDate: today(), provider: "ENEL", ...overrides });

const createTx = (token, overrides = {}) =>
  request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({ type: "Saida", value: 200, date: today(), description: "ENEL SP ENERGIA", ...overrides });

// ─── Unit: scoring engine ─────────────────────────────────────────────────────

describe("scoreBillTransactionMatch — unit", () => {
  const makeBill = (amount, due_date, title = "ENEL", provider = "ENEL") => ({
    amount,
    due_date,
    title,
    provider,
  });
  const makeTx = (value, date, description = "ENEL SP ENERGIA") => ({
    value,
    date,
    description,
  });

  it("retorna score 1.0 para match perfeito (mesmo valor, mesma data, provider match)", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(200, "2026-03-25"));
    expect(result).not.toBeNull();
    expect(result.score).toBe(1.0);
    expect(result.amountScore).toBe(0.5);
    expect(result.dateScore).toBe(0.3);
    expect(result.providerScore).toBe(0.2);
    expect(result.divergencePercent).toBe(0);
    expect(result.requiresDivergenceConfirmation).toBe(false);
  });

  it("amountScore = 0.35 para divergencia de 3%", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(206, "2026-03-25"));
    expect(result).not.toBeNull();
    expect(result.amountScore).toBe(0.35);
    expect(result.divergencePercent).toBe(3);
    expect(result.requiresDivergenceConfirmation).toBe(false);
  });

  it("amountScore = 0.15 para divergencia de 10%", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(220, "2026-03-25"));
    expect(result).not.toBeNull();
    expect(result.amountScore).toBe(0.15);
    expect(result.requiresDivergenceConfirmation).toBe(true);
  });

  it("retorna null para divergencia de 20% (acima do limite)", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(240, "2026-03-25"));
    expect(result).toBeNull();
  });

  it("dateScore = 0.22 para delta de 2 dias", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(200, "2026-03-27"));
    expect(result).not.toBeNull();
    expect(result.dateScore).toBe(0.22);
  });

  it("dateScore = 0.12 para delta de 5 dias", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(200, "2026-03-30"));
    expect(result).not.toBeNull();
    expect(result.dateScore).toBe(0.12);
  });

  it("dateScore = 0 para delta de 8 dias", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(200, "2026-04-02"));
    expect(result).not.toBeNull();
    expect(result.dateScore).toBe(0);
  });

  it("providerScore = 0 quando description nao contém provider nem title", () => {
    const result = scoreBillTransactionMatch(
      makeBill(200, "2026-03-25", "Conta Agua", "Sabesp"),
      makeTx(200, "2026-03-25", "NETFLIX ASSINATURA")
    );
    expect(result).not.toBeNull();
    expect(result.providerScore).toBe(0);
  });

  it("providerScore = 0.2 quando title aparece na description (sem provider)", () => {
    const result = scoreBillTransactionMatch(
      makeBill(200, "2026-03-25", "Sabesp Agua", null),
      makeTx(200, "2026-03-25", "SABESP AGUA SP")
    );
    expect(result).not.toBeNull();
    expect(result.providerScore).toBe(0.2);
  });

  it("requiresDivergenceConfirmation = true quando divergencia > 5%", () => {
    const result = scoreBillTransactionMatch(makeBill(200, "2026-03-25"), makeTx(215, "2026-03-25"));
    expect(result).not.toBeNull();
    expect(result.requiresDivergenceConfirmation).toBe(true);
  });
});

// ─── Integration ──────────────────────────────────────────────────────────────

describe("reconciliation — integration", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM users");
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  it("GET /bills/:id/match-candidates bloqueia sem token", async () => {
    const res = await request(app).get("/bills/1/match-candidates");
    expect(res.status).toBe(401);
  });

  it("POST /bills/:id/confirm-match bloqueia sem token", async () => {
    const res = await request(app).post("/bills/1/confirm-match").send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /bills/:id/match bloqueia sem token", async () => {
    const res = await request(app).delete("/bills/1/match");
    expect(res.status).toBe(401);
  });

  // ─── GET match-candidates ─────────────────────────────────────────────────

  it("GET /bills/:id/match-candidates retorna candidato com score alto", async () => {
    const token = await registerAndLogin("recon-candidates-1@test.dev");

    const billRes = await createBill(token);
    const billId = billRes.body.id;

    await createTx(token); // same date, same value, provider match → score 1.0

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.bill.id).toBe(billId);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].score).toBeGreaterThanOrEqual(0.75);
    expect(res.body.candidates[0].requiresDivergenceConfirmation).toBe(false);
  });

  it("GET /bills/:id/match-candidates exclui transacoes com divergencia > 15%", async () => {
    const token = await registerAndLogin("recon-candidates-2@test.dev");

    const billRes = await createBill(token, { amount: 200 });
    const billId = billRes.body.id;

    await createTx(token, { value: 240, description: "ENEL ENERGIA" }); // 20% divergência → null

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
  });

  it("GET /bills/:id/match-candidates exclui transacoes fora da janela de 10 dias", async () => {
    const token = await registerAndLogin("recon-candidates-3@test.dev");

    const billRes = await createBill(token, { dueDate: today() });
    const billId = billRes.body.id;

    // 15 days away — outside window
    await createTx(token, { date: offsetDate(15), description: "ENEL ENERGIA" });

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
  });

  it("GET /bills/:id/match-candidates retorna 404 para bill de outro usuario", async () => {
    const token1 = await registerAndLogin("recon-iso-1@test.dev");
    const token2 = await registerAndLogin("recon-iso-2@test.dev");

    const billRes = await createBill(token1);
    const billId = billRes.body.id;

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });

  it("GET /bills/:id/match-candidates retorna candidatos vazio para bill ja conciliada", async () => {
    const token = await registerAndLogin("recon-matched-cands@test.dev");

    const billRes = await createBill(token);
    const txRes = await createTx(token);
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
    expect(res.body.bill.matchStatus).toBe("matched");
  });

  it("GET /bills/:id/match-candidates exclui transacoes de Entrada", async () => {
    const token = await registerAndLogin("recon-entrada@test.dev");

    const billRes = await createBill(token);
    const billId = billRes.body.id;

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Entrada", value: 200, date: today(), description: "ENEL ENERGIA" });

    const res = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
  });

  // ─── POST confirm-match ───────────────────────────────────────────────────

  it("POST /bills/:id/confirm-match concilia bill com transacao", async () => {
    const token = await registerAndLogin("recon-confirm-1@test.dev");

    const billRes = await createBill(token);
    const txRes = await createTx(token);
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(200);
    expect(res.body.billId).toBe(billId);
    expect(res.body.matchStatus).toBe("matched");
    expect(res.body.linkedTransactionId).toBe(txId);
    expect(typeof res.body.matchedAt).toBe("string");
    expect(res.body.divergencePercent).toBe(0);
  });

  it("POST /bills/:id/confirm-match retorna 409 para bill ja conciliada", async () => {
    const token = await registerAndLogin("recon-confirm-dup@test.dev");

    const billRes = await createBill(token);
    const txRes = await createTx(token);
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(409);
  });

  it("POST /bills/:id/confirm-match retorna 422 com code quando divergencia > 5% sem confirmacao", async () => {
    const token = await registerAndLogin("recon-diverg-noconfirm@test.dev");

    const billRes = await createBill(token, { amount: 200 });
    const txRes = await createTx(token, { value: 215, description: "ENEL SP" }); // 7.5% divergence
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId, confirmDivergence: false });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DIVERGENCE_CONFIRMATION_REQUIRED");
    expect(typeof res.body.divergencePercent).toBe("number");
    expect(res.body.divergencePercent).toBeGreaterThan(5);
  });

  it("POST /bills/:id/confirm-match aceita divergencia > 5% com confirmDivergence: true", async () => {
    const token = await registerAndLogin("recon-diverg-confirm@test.dev");

    const billRes = await createBill(token, { amount: 200 });
    const txRes = await createTx(token, { value: 215, description: "ENEL SP" }); // 7.5%
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId, confirmDivergence: true });

    expect(res.status).toBe(200);
    expect(res.body.matchStatus).toBe("matched");
    expect(res.body.divergencePercent).toBeGreaterThan(5);
  });

  it("POST /bills/:id/confirm-match retorna 409 quando transacao ja esta vinculada a outra bill", async () => {
    const token = await registerAndLogin("recon-tx-unique@test.dev");

    const bill1Res = await createBill(token, { title: "Energia Jan" });
    const bill2Res = await createBill(token, { title: "Energia Fev" });
    const txRes = await createTx(token);
    const bill1Id = bill1Res.body.id;
    const bill2Id = bill2Res.body.id;
    const txId = txRes.body.id;

    // Link to bill1
    await request(app)
      .post(`/bills/${bill1Id}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    // Try to link same tx to bill2
    const res = await request(app)
      .post(`/bills/${bill2Id}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(409);
  });

  it("POST /bills/:id/confirm-match retorna 404 para bill de outro usuario", async () => {
    const token1 = await registerAndLogin("recon-confirm-iso-1@test.dev");
    const token2 = await registerAndLogin("recon-confirm-iso-2@test.dev");

    const billRes = await createBill(token1);
    const txRes = await createTx(token2);
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(404);
  });

  it("POST /bills/:id/confirm-match retorna 404 para transacao de outro usuario", async () => {
    const token1 = await registerAndLogin("recon-tx-iso-1@test.dev");
    const token2 = await registerAndLogin("recon-tx-iso-2@test.dev");

    const billRes = await createBill(token1);
    const txRes = await createTx(token2); // tx pertence ao token2
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token1}`) // token1 tenta usar tx de token2
      .send({ transactionId: txId });

    expect(res.status).toBe(404);
  });

  it("POST /bills/:id/confirm-match retorna 422 para transacao do tipo Entrada", async () => {
    const token = await registerAndLogin("recon-entrada-confirm@test.dev");

    const billRes = await createBill(token);
    const txRes = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Entrada", value: 200, date: today(), description: "Salario" });

    const billId = billRes.body.id;
    const txId = txRes.body.id;

    const res = await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(422);
  });

  // ─── DELETE match (unmatch) ───────────────────────────────────────────────

  it("DELETE /bills/:id/match desfaz a conciliacao", async () => {
    const token = await registerAndLogin("recon-unmatch-1@test.dev");

    const billRes = await createBill(token);
    const txRes = await createTx(token);
    const billId = billRes.body.id;
    const txId = txRes.body.id;

    await request(app)
      .post(`/bills/${billId}/confirm-match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    const res = await request(app)
      .delete(`/bills/${billId}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billId).toBe(billId);
    expect(res.body.matchStatus).toBe("unmatched");

    // Transacao pode ser usada novamente
    const recandidates = await request(app)
      .get(`/bills/${billId}/match-candidates`)
      .set("Authorization", `Bearer ${token}`);

    expect(recandidates.body.candidates.length).toBeGreaterThan(0);
  });

  it("DELETE /bills/:id/match retorna 409 quando bill nao esta conciliada", async () => {
    const token = await registerAndLogin("recon-unmatch-2@test.dev");

    const billRes = await createBill(token);
    const billId = billRes.body.id;

    const res = await request(app)
      .delete(`/bills/${billId}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });
});
