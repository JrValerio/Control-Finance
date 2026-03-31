import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  expectErrorResponseWithRequestId,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

// Stable reference to the mock fn — hoisted so it's available inside vi.mock factory
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

const buildMockAnthropicResponse = (text) => ({
  content: [{ type: "text", text }],
});

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  mockCreate.mockReset();
  await dbQuery("DELETE FROM user_forecasts");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM categories");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

const insertForecast = async (userId, overrides = {}) => {
  const now = new Date();
  const mStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const defaults = {
    projected_balance: 800,
    income_expected: 3000,
    spending_to_date: 1200,
    daily_avg_spending: 60,
    days_remaining: 10,
  };
  const v = { ...defaults, ...overrides };
  await dbQuery(
    `INSERT INTO user_forecasts
       (user_id, month, engine_version, projected_balance, income_expected,
        spending_to_date, daily_avg_spending, days_remaining,
        flip_detected, flip_direction, generated_at)
     VALUES ($1, $2, 'v1', $3, $4, $5, $6, $7, false, null, NOW())`,
    [userId, mStart, v.projected_balance, v.income_expected, v.spending_to_date, v.daily_avg_spending, v.days_remaining],
  );
  return mStart;
};

const getUserId = async (email) => {
  const r = await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  return r.rows[0].id;
};

describe("GET /ai/insight", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/ai/insight");
    expectErrorResponseWithRequestId(res, 401, "Token de autenticacao ausente ou invalido.");
  });

  it("retorna null quando nao ha forecast para o mes", async () => {
    const token = await registerAndLogin("ai-no-forecast@test.dev");

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("retorna null quando forecast tem daysRemaining zero", async () => {
    const token = await registerAndLogin("ai-zero-days@test.dev");
    const userId = await getUserId("ai-zero-days@test.dev");
    await insertForecast(userId, { days_remaining: 0 });

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("retorna insight estruturado quando forecast valido e LLM responde", async () => {
    const token = await registerAndLogin("ai-valid@test.dev");
    const userId = await getUserId("ai-valid@test.dev");
    await insertForecast(userId);

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Seu saldo está saudável. Considere reservar R$ 200 para uma meta de emergência.")
    );

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "success",
      title: "Dica do Especialista",
      message: "Seu saldo está saudável. Considere reservar R$ 200 para uma meta de emergência.",
      action_label: "Ver detalhes",
    });
    expect(typeof res.body.id).toBe("string");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("retorna type warning quando adjustedProjectedBalance e negativo", async () => {
    const token = await registerAndLogin("ai-negative@test.dev");
    const userId = await getUserId("ai-negative@test.dev");
    await insertForecast(userId, { projected_balance: -300 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Projeção negativa. Corte gastos em Lazer para equilibrar o mês.")
    );

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("warning");
  });

  it("retorna null silenciosamente quando LLM falha", async () => {
    const token = await registerAndLogin("ai-llm-fail@test.dev");
    const userId = await getUserId("ai-llm-fail@test.dev");
    await insertForecast(userId);

    mockCreate.mockRejectedValueOnce(new Error("Network error"));

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("retorna null sem chamar LLM quando risk_only e forecast positivo", async () => {
    const token = await registerAndLogin("ai-risk-only-skip@test.dev");
    const userId = await getUserId("ai-risk-only-skip@test.dev");
    await insertForecast(userId, { projected_balance: 800 });
    await dbQuery(
      `INSERT INTO user_profiles (user_id, ai_insight_frequency) VALUES ($1, 'risk_only')`,
      [userId],
    );

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("chama LLM quando risk_only mas forecast negativo", async () => {
    const token = await registerAndLogin("ai-risk-only-warn@test.dev");
    const userId = await getUserId("ai-risk-only-warn@test.dev");
    await insertForecast(userId, { projected_balance: -200 });
    await dbQuery(
      `INSERT INTO user_profiles (user_id, ai_insight_frequency) VALUES ($1, 'risk_only')`,
      [userId],
    );

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Saldo negativo. Corte gastos imediatamente."),
    );

    const res = await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("warning");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("usa system prompt do tom motivador quando ai_tone e motivator", async () => {
    const token = await registerAndLogin("ai-motivator@test.dev");
    const userId = await getUserId("ai-motivator@test.dev");
    await insertForecast(userId);
    await dbQuery(
      `INSERT INTO user_profiles (user_id, ai_tone) VALUES ($1, 'motivator')`,
      [userId],
    );

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Você está indo bem! Continue assim."),
    );

    await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.system).toContain("encorajador");
  });

  it("passa top_categories ao LLM quando existem transacoes de saida", async () => {
    const token = await registerAndLogin("ai-categories@test.dev");
    const userId = await getUserId("ai-categories@test.dev");
    await insertForecast(userId);

    const catResult = await dbQuery(
      `INSERT INTO categories (user_id, name, normalized_name) VALUES ($1, 'Alimentacao', 'alimentacao') RETURNING id`,
      [userId],
    );
    const catId = catResult.rows[0].id;
    const now = new Date();
    const txDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    await dbQuery(
      `INSERT INTO transactions (user_id, description, value, type, date, category_id)
       VALUES ($1, 'Supermercado', 400, 'Saida', $2, $3)`,
      [userId, txDate, catId],
    );

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Alimentacao é seu maior gasto. Reduza em R$ 100 para melhorar a projeção.")
    );

    await request(app)
      .get("/ai/insight")
      .set("Authorization", `Bearer ${token}`);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0];
    const userContent = JSON.parse(callArg.messages[0].content);
    expect(userContent.top_categories[0].name).toBe("Alimentacao");
    expect(userContent.top_categories[0].expense).toBe(400);
  });
});

// ─── GET /ai/bank-account-insight ────────────────────────────────────────────

const localDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const resetAiState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  mockCreate.mockReset();
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM bank_accounts");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM user_forecasts");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM categories");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

describe("GET /ai/bank-account-insight", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetAiState);

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/ai/bank-account-insight");
    expect(res.status).toBe(401);
  });

  it("retorna null quando usuario nao tem contas bancarias", async () => {
    const token = await registerAndLogin("bank-insight-empty@test.dev");

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retorna type success e chama LLM quando conta saudavel", async () => {
    const token = await registerAndLogin("bank-insight-healthy@test.dev");

    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta Corrente", balance: 1500, limitTotal: 1000 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Sua conta está positiva e com limite disponível. Bom momento para reservar.")
    );

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("success");
    expect(res.body.riskLabel).toBe("saudável");
    expect(typeof res.body.message).toBe("string");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("retorna type success quando conta esta positiva e sem limite configurado", async () => {
    const token = await registerAndLogin("bank-insight-no-limit-positive@test.dev");

    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: 300, limitTotal: 0 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Conta positiva e sem uso de limite. Cenário estável no momento.")
    );

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("success");
    expect(res.body.riskLabel).toBe("saudável");
  });

  it("retorna type warning e riskLabel pressionada quando conta usa limite", async () => {
    const token = await registerAndLogin("bank-insight-warning@test.dev");

    // balance negative means limitUsed > 0
    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: -300, limitTotal: 1000 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Você está usando parte do cheque especial. Evite novos gastos essa semana.")
    );

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("warning");
    expect(res.body.riskLabel).toBe("pressionada");
  });

  it("retorna type critical e riskLabel no limite quando limite esgotado", async () => {
    const token = await registerAndLogin("bank-insight-critical@test.dev");

    // balance = -1000, limitTotal = 1000 → limitUsed = limitTotal
    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: -1000, limitTotal: 1000 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Limite esgotado. Priorize quitar o saldo negativo antes de qualquer gasto.")
    );

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("critical");
    expect(res.body.riskLabel).toBe("no limite");
  });

  it("retorna type critical quando saldo fica negativo sem limite configurado", async () => {
    const token = await registerAndLogin("bank-insight-no-limit-negative@test.dev");

    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: -120, limitTotal: 0 });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Saldo negativo sem limite configurado. Priorize recompor caixa imediatamente.")
    );

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("critical");
    expect(res.body.riskLabel).toBe("no limite");
  });

  it("retorna null silenciosamente quando LLM falha", async () => {
    const token = await registerAndLogin("bank-insight-llm-fail@test.dev");

    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: 500, limitTotal: 0 });

    mockCreate.mockRejectedValueOnce(new Error("timeout"));

    const res = await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("nao envia valores monetarios crus ao LLM", async () => {
    const token = await registerAndLogin("bank-insight-no-raw-values@test.dev");

    await request(app)
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Conta", balance: 2500.75, limitTotal: 5000 });

    mockCreate.mockResolvedValueOnce(buildMockAnthropicResponse("OK"));

    await request(app)
      .get("/ai/bank-account-insight")
      .set("Authorization", `Bearer ${token}`);

    const callArg = mockCreate.mock.calls[0][0];
    const context = JSON.parse(callArg.messages[0].content);

    // Should have booleans/ratios — not raw currency amounts
    expect(typeof context.total_balance_positive).toBe("boolean");
    expect(typeof context.using_limit).toBe("boolean");
    expect(typeof context.limit_pressure_pct).toBe("number");
    // Should NOT expose raw balance or limitTotal
    expect(context.total_balance).toBeUndefined();
    expect(context.limit_total).toBeUndefined();
  });
});

// ─── GET /ai/utility-insight ─────────────────────────────────────────────────

describe("GET /ai/utility-insight", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetAiState);

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/ai/utility-insight");
    expect(res.status).toBe(401);
  });

  it("retorna null quando nao ha contas de consumo pendentes", async () => {
    const token = await registerAndLogin("util-insight-empty@test.dev");

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retorna type critical quando ha contas vencidas", async () => {
    const token = await registerAndLogin("util-insight-critical@test.dev");
    const PAST = localDate(-5);

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Energia vencida", amount: 180, dueDate: PAST, billType: "energy" });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Há conta de energia vencida há 5 dias. Regularize para evitar corte.")
    );

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("critical");
    expect(res.body.riskLabel).toBe("contas vencidas");
    expect(typeof res.body.message).toBe("string");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("retorna type warning quando nao ha vencidas mas ha contas a vencer em 7 dias", async () => {
    const token = await registerAndLogin("util-insight-warning@test.dev");
    const SOON = localDate(3);

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Água próxima", amount: 95, dueDate: SOON, billType: "water" });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Conta de água vence em breve. Reserve o valor agora.")
    );

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("warning");
    expect(res.body.riskLabel).toBe("vence em breve");
  });

  it("retorna type success quando todas as contas sao futuras (> 7 dias)", async () => {
    const token = await registerAndLogin("util-insight-success@test.dev");
    const FUTURE = localDate(20);

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Internet futura", amount: 120, dueDate: FUTURE, billType: "internet" });

    mockCreate.mockResolvedValueOnce(
      buildMockAnthropicResponse("Todas as contas de consumo estão em dia. Nenhuma urgência no momento.")
    );

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("success");
    expect(res.body.riskLabel).toBe("em dia");
  });

  it("retorna null silenciosamente quando LLM falha", async () => {
    const token = await registerAndLogin("util-insight-llm-fail@test.dev");
    const PAST = localDate(-1);

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Gás vencido", amount: 60, dueDate: PAST, billType: "gas" });

    mockCreate.mockRejectedValueOnce(new Error("LLM unavailable"));

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("critical tem prioridade sobre warning quando ha mistura de buckets", async () => {
    const token = await registerAndLogin("util-insight-priority@test.dev");
    const PAST = localDate(-2);
    const SOON = localDate(2);

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Energia vencida", amount: 150, dueDate: PAST, billType: "energy" });

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Água próxima", amount: 90, dueDate: SOON, billType: "water" });

    mockCreate.mockResolvedValueOnce(buildMockAnthropicResponse("Duas pendências urgentes."));

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("critical");
  });

  it("ignora contas de consumo pagas no calculo do insight", async () => {
    const token = await registerAndLogin("util-insight-paid@test.dev");
    const PAST = localDate(-3);
    const FUTURE = localDate(30);

    // Create and pay an overdue bill
    const created = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Energia paga", amount: 200, dueDate: PAST, billType: "energy" });

    await request(app)
      .patch(`/bills/${created.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    // Only a future pending bill remains
    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Internet futura", amount: 100, dueDate: FUTURE, billType: "internet" });

    mockCreate.mockResolvedValueOnce(buildMockAnthropicResponse("Tudo em dia."));

    const res = await request(app)
      .get("/ai/utility-insight")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Should be success, not critical — paid overdue bill must not influence risk
    expect(res.body.type).toBe("success");
  });
});
