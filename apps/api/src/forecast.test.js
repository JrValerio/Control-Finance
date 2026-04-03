import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  getUserIdByEmail,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { computeForecast, getLatestForecast } from "./services/forecast.service.js";

// Fixed "now" for deterministic tests — 10th day of month, plenty of days remaining
const FIXED_NOW = new Date("2026-03-10T12:00:00.000Z");
const FIXED_MONTH = "2026-03";
const FIXED_MONTH_START = "2026-03-01";
const FIXED_MONTH_END = "2026-03-31";

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM user_forecasts");
  await dbQuery("DELETE FROM bank_accounts");
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM income_statements");
  await dbQuery("DELETE FROM income_sources");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

// ─── HTTP endpoint tests ─────────────────────────────────────────────────────

describe("GET /forecasts/current", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/forecasts/current");
    expect(res.status).toBe(401);
  });

  it("retorna null quando nenhum forecast existe para o mes", async () => {
    const token = await registerAndLogin("fc-get-null@test.dev");

    const res = await request(app)
      .get("/forecasts/current")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("retorna forecast armazenado apos recompute", async () => {
    const token = await registerAndLogin("fc-get-stored@test.dev");

    await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get("/forecasts/current")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    expect(typeof res.body.projectedBalance).toBe("number");
    expect(typeof res.body.month).toBe("string");
  });
});

describe("POST /forecasts/recompute", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/forecasts/recompute");
    expect(res.status).toBe(401);
  });

  it("retorna forecast com shape correto para usuario sem transacoes", async () => {
    const token = await registerAndLogin("fc-shape@test.dev");

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.month).toBe("string");
    expect(typeof res.body.projectedBalance).toBe("number");
    expect(typeof res.body.spendingToDate).toBe("number");
    expect(typeof res.body.dailyAvgSpending).toBe("number");
    expect(typeof res.body.daysRemaining).toBe("number");
    expect(typeof res.body.flipDetected).toBe("boolean");
    expect(res.body.engineVersion).toBe("v2");
    expect(res.body.incomeExpected).toBeNull();
    expect(res.body._meta).toMatchObject({
      balanceBasis: "net_month_transactions",
      incomeBasis: "salary_profile_fallback",
      pendingItems: {
        bills: 0,
        invoices: 0,
        creditCardCycles: 0,
      },
    });
    expect(Array.isArray(res.body._meta.fallbacksUsed)).toBe(true);
  });

  it("reflete gastos do mes nas metricas", async () => {
    const token = await registerAndLogin("fc-spending@test.dev");
    const today = new Date().toISOString().slice(0, 10);

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Saida", value: 300, date: today });

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.spendingToDate).toBe(300);
  });

  it("atualiza o forecast existente ao recomputar (upsert)", async () => {
    const token = await registerAndLogin("fc-upsert@test.dev");

    const first = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);

    // Only one row should exist
    const userId = await getUserIdByEmail("fc-upsert@test.dev");
    const rows = await dbQuery(
      `SELECT COUNT(*) AS cnt FROM user_forecasts WHERE user_id = $1`,
      [userId],
    );
    expect(Number(rows.rows[0].cnt)).toBe(1);
  });

  it("isolamento: forecast do usuario A nao afeta usuario B", async () => {
    const tokenA = await registerAndLogin("fc-iso-a@test.dev");
    const tokenB = await registerAndLogin("fc-iso-b@test.dev");
    const today = new Date().toISOString().slice(0, 10);

    // User A has expenses
    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "Saida", value: 1000, date: today });

    await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${tokenA}`);

    const resA = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${tokenA}`);
    const resB = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resA.body.spendingToDate).toBe(1000);
    expect(resB.body.spendingToDate).toBe(0);
  });
});

// ─── Service tests (with fixed `now` for deterministic date math) ─────────────

describe("computeForecast — flip detection (deterministic)", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("detecta flip pos_to_neg ao acumular gastos alem do saldo projetado", async () => {
    await registerAndLogin("fc-flip-pn@test.dev");
    const userId = await getUserIdByEmail("fc-flip-pn@test.dev");

    // Setup: user has salary = 5000, payday = 31 (always upcoming on day 10)
    await dbQuery(
      `INSERT INTO user_profiles (user_id, salary_monthly, payday)
       VALUES ($1, 5000, 31)`,
      [userId],
    );

    // First compute (no spending) — salary adjustment makes it positive
    const first = await computeForecast(userId, { now: FIXED_NOW });
    expect(first.flipDetected).toBe(false);
    expect(first.projectedBalance).toBeGreaterThan(0);

    // Add enormous expense to force negative projection
    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Saida', 200000, $2)`,
      [userId, FIXED_MONTH_START],
    );

    // Second compute — should detect pos_to_neg
    const second = await computeForecast(userId, { now: FIXED_NOW });
    expect(second.flipDetected).toBe(true);
    expect(second.flipDirection).toBe("pos_to_neg");
    expect(second.projectedBalance).toBeLessThan(0);
  });

  it("detecta flip neg_to_pos ao receber grande entrada apos saldo negativo", async () => {
    await registerAndLogin("fc-flip-np@test.dev");
    const userId = await getUserIdByEmail("fc-flip-np@test.dev");

    // Start with large expense → negative
    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Saida', 200000, $2)`,
      [userId, FIXED_MONTH_START],
    );

    const negForecast = await computeForecast(userId, { now: FIXED_NOW });
    expect(negForecast.projectedBalance).toBeLessThan(0);
    expect(negForecast.flipDetected).toBe(false);

    // Add enormous income to flip positive
    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Entrada', 999999, $2)`,
      [userId, FIXED_MONTH_START],
    );

    const second = await computeForecast(userId, { now: FIXED_NOW });
    expect(second.flipDetected).toBe(true);
    expect(second.flipDirection).toBe("neg_to_pos");
    expect(second.projectedBalance).toBeGreaterThan(0);
  });

  it("nao detecta flip quando saldo permanece positivo", async () => {
    await registerAndLogin("fc-no-flip-pos@test.dev");
    const userId = await getUserIdByEmail("fc-no-flip-pos@test.dev");

    await computeForecast(userId, { now: FIXED_NOW });
    const second = await computeForecast(userId, { now: FIXED_NOW });

    expect(second.flipDetected).toBe(false);
    expect(second.flipDirection).toBeNull();
  });

  it("inclui salary no projetado quando payday ainda nao chegou neste mes", async () => {
    await registerAndLogin("fc-salary@test.dev");
    const userId = await getUserIdByEmail("fc-salary@test.dev");

    // payday = 31 → always upcoming on day 10
    await dbQuery(
      `INSERT INTO user_profiles (user_id, salary_monthly, payday)
       VALUES ($1, 3000, 31)`,
      [userId],
    );

    // Compute without salary profile
    const withoutSalary = await computeForecast(userId, { now: FIXED_NOW });

    // Now ensure salary is reflected (incomeExpected = 3000)
    expect(withoutSalary.incomeExpected).toBe(3000);
    // projectedBalance should include salary adjustment: 3000 + (0 - 0) - (0 * days) = 3000
    expect(withoutSalary.projectedBalance).toBe(3000);
  });

  it("nao inclui salary quando payday ja passou neste mes", async () => {
    await registerAndLogin("fc-payday-past@test.dev");
    const userId = await getUserIdByEmail("fc-payday-past@test.dev");

    // payday = 1 → always past on day 10
    await dbQuery(
      `INSERT INTO user_profiles (user_id, salary_monthly, payday)
       VALUES ($1, 5000, 1)`,
      [userId],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    // No income adjustment because payday (1) < todayDay (10)
    // projectedBalance = (0 - 0) + 0 - (0 * days) = 0
    expect(result.projectedBalance).toBe(0);
  });

  it("calcula uso projetado do limite bancario quando a projeção entra no cheque especial", async () => {
    await registerAndLogin("fc-bank-limit-using@test.dev");
    const userId = await getUserIdByEmail("fc-bank-limit-using@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, bank_limit_total)
       VALUES ($1, 1000)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Saida', 500, $2)`,
      [userId, FIXED_MONTH_START],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.adjustedProjectedBalance).toBeLessThan(0);
    expect(result.bankLimit).toMatchObject({
      total: 1000,
      status: "using",
      exceededBy: 0,
    });
    expect(result.bankLimit.used).toBeGreaterThan(0);
    expect(result.bankLimit.remaining).toBeLessThan(1000);
  });

  it("marca limite bancario como excedido quando a projeção passa do cheque especial", async () => {
    await registerAndLogin("fc-bank-limit-exceeded@test.dev");
    const userId = await getUserIdByEmail("fc-bank-limit-exceeded@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, bank_limit_total)
       VALUES ($1, 1000)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Saida', 900, $2)`,
      [userId, FIXED_MONTH_START],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.bankLimit).toMatchObject({
      total: 1000,
      used: 1000,
      remaining: 0,
      status: "exceeded",
    });
    expect(result.bankLimit.exceededBy).toBeGreaterThan(0);
    expect(result.bankLimit.alertTriggered).toBe(true);
  });

  it("prioriza limite de bank_accounts sobre bank_limit_total legado quando ha contas ativas", async () => {
    await registerAndLogin("fc-bank-limit-priority@test.dev");
    const userId = await getUserIdByEmail("fc-bank-limit-priority@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, bank_limit_total)
       VALUES ($1, 5000)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta principal', 0, 1000)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date)
       VALUES ($1, 'Saida', 500, $2)`,
      [userId, FIXED_MONTH_START],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.bankLimit).toMatchObject({
      total: 1000,
    });
  });

  it("getLatestForecast retorna null antes do primeiro compute", async () => {
    await registerAndLogin("fc-get-null-svc@test.dev");
    const userId = await getUserIdByEmail("fc-get-null-svc@test.dev");

    const result = await getLatestForecast(userId, { now: FIXED_NOW });
    expect(result).toBeNull();
  });

  it("getLatestForecast retorna forecast apos compute", async () => {
    await registerAndLogin("fc-get-stored-svc@test.dev");
    const userId = await getUserIdByEmail("fc-get-stored-svc@test.dev");

    await computeForecast(userId, { now: FIXED_NOW });

    const result = await getLatestForecast(userId, { now: FIXED_NOW });
    expect(result).not.toBeNull();
    expect(result.month).toBe(FIXED_MONTH);
    expect(typeof result.projectedBalance).toBe("number");
  });

  it("getLatestForecast prioriza limite de contas ativas sobre valor legado do perfil", async () => {
    await registerAndLogin("fc-get-bank-limit-priority@test.dev");
    const userId = await getUserIdByEmail("fc-get-bank-limit-priority@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, bank_limit_total)
       VALUES ($1, 900)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta operacional', 100, 250)`,
      [userId],
    );

    await computeForecast(userId, { now: FIXED_NOW });

    const result = await getLatestForecast(userId, { now: FIXED_NOW });

    expect(result.bankLimit).toMatchObject({
      total: 250,
    });
  });
});

describe("computeForecast — projection semantics (deterministic)", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("usa saldo real de contas como base e trata bills pendentes como obrigacao futura", async () => {
    await registerAndLogin("fc-sem-a@test.dev");
    const userId = await getUserIdByEmail("fc-sem-a@test.dev");

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta corrente', 1000, 500)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, status)
       VALUES ($1, 'Internet', 300, $2, 'pending')`,
      [userId, FIXED_MONTH_END],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.projectedBalance).toBe(1000);
    expect(result.spendingToDate).toBe(0);
    expect(result.billsPendingTotal).toBe(300);
    expect(result.billsPendingCount).toBe(1);
    expect(result.adjustedProjectedBalance).toBe(700);
    expect(result._meta).toMatchObject({
      balanceBasis: "bank_account",
      pendingItems: {
        bills: 1,
      },
    });
  });

  it("inclui fatura aberta como obrigacao futura sem tratar como saida liquidada", async () => {
    await registerAndLogin("fc-sem-b@test.dev");
    const userId = await getUserIdByEmail("fc-sem-b@test.dev");

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta principal', 1200, 0)`,
      [userId],
    );

    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, status, bill_type)
       VALUES ($1, 'Fatura Cartao Março', 450, $2, 'pending', 'credit_card_invoice')`,
      [userId, FIXED_MONTH_END],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.spendingToDate).toBe(0);
    expect(result.projectedBalance).toBe(1200);
    expect(result.billsPendingTotal).toBe(450);
    expect(result.adjustedProjectedBalance).toBe(750);
  });

  it("renda confirmada futura aumenta a projecao", async () => {
    await registerAndLogin("fc-sem-c@test.dev");
    const userId = await getUserIdByEmail("fc-sem-c@test.dev");

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta salário', 1000, 0)`,
      [userId],
    );

    const sourceId = await insertIncomeSource(userId, "Salário principal");
    await insertStatement(sourceId, {
      referenceMonth: "2026-03",
      netAmount: 500,
      paymentDate: "2026-03-25",
      status: "posted",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBe(500);
    expect(result.projectedBalance).toBe(1500);
  });

  it("renda nao confirmada (draft) nao aumenta a projecao", async () => {
    await registerAndLogin("fc-sem-d@test.dev");
    const userId = await getUserIdByEmail("fc-sem-d@test.dev");

    await dbQuery(
      `INSERT INTO bank_accounts (user_id, name, balance, limit_total)
       VALUES ($1, 'Conta salário', 1000, 0)`,
      [userId],
    );

    const sourceId = await insertIncomeSource(userId, "Renda detectada");
    await insertStatement(sourceId, {
      referenceMonth: "2026-03",
      netAmount: 400,
      paymentDate: "2026-03-20",
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBeNull();
    expect(result.projectedBalance).toBe(1000);
  });
});

// ─── Forecast + Bills integration ────────────────────────────────────────────

// Helpers for real current-month boundaries (HTTP tests use real `now`)
const _now = new Date();
const CURRENT_MONTH_END = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth() + 1, 0))
  .toISOString()
  .slice(0, 10);
const CURRENT_MONTH_START = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), 1))
  .toISOString()
  .slice(0, 10);
// A date well beyond the current month to test exclusion
const NEXT_MONTH_DATE = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth() + 1, 15))
  .toISOString()
  .slice(0, 10);

describe("forecast — bills integration", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM user_forecasts");
    await dbQuery("DELETE FROM user_profiles");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM user_identities");
    await dbQuery("DELETE FROM users");
  });

  it("recompute inclui bill pendente do mes na projecao ajustada", async () => {
    const token = await registerAndLogin("fc-bills-pending@test.dev");

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Aluguel", amount: 1200, dueDate: CURRENT_MONTH_END });

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingTotal).toBe(1200);
    expect(res.body.billsPendingCount).toBe(1);
    expect(res.body.adjustedProjectedBalance).toBe(
      Number((res.body.projectedBalance - 1200).toFixed(2)),
    );
  });

  it("recompute com bill paga nao afeta projecao ajustada", async () => {
    const token = await registerAndLogin("fc-bills-paid@test.dev");

    const createRes = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Luz", amount: 200, dueDate: CURRENT_MONTH_END });
    const billId = createRes.body.id;

    await request(app)
      .patch(`/bills/${billId}/mark-paid`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingTotal).toBe(0);
    expect(res.body.billsPendingCount).toBe(0);
    expect(res.body.adjustedProjectedBalance).toBe(res.body.projectedBalance);
  });

  it("bill vencida ainda pendente e incluida na projecao", async () => {
    const token = await registerAndLogin("fc-bills-overdue@test.dev");

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Internet", amount: 99.9, dueDate: CURRENT_MONTH_START });

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingTotal).toBeGreaterThan(0);
    expect(res.body.billsPendingCount).toBe(1);
  });

  it("bill de proximo mes nao afeta projecao ajustada do mes atual", async () => {
    const token = await registerAndLogin("fc-bills-nextmonth@test.dev");

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "IPTU", amount: 500, dueDate: NEXT_MONTH_DATE });

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingTotal).toBe(0);
    expect(res.body.billsPendingCount).toBe(0);
    expect(res.body.adjustedProjectedBalance).toBe(res.body.projectedBalance);
  });

  it("GET /forecasts/current enriquece com bills em tempo real", async () => {
    const token = await registerAndLogin("fc-bills-realtime@test.dev");
    const userId = await getUserIdByEmail("fc-bills-realtime@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, bank_limit_total)
       VALUES ($1, 800)`,
      [userId],
    );

    // Seed a known income transaction so projectedBalance is deterministic (100),
    // regardless of the current date (avoids salary/payday timing sensitivity)
    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ($1, 'Entrada', 100, $2, 'Renda')`,
      [userId, CURRENT_MONTH_START],
    );

    // Recompute without bills — stored projectedBalance = 100 (netToDate=100, dailyAvg=0)
    await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    // Add bill AFTER recompute
    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: 180, dueDate: CURRENT_MONTH_END });

    // GET /current should reflect the fresh bill even without recompute
    const res = await request(app)
      .get("/forecasts/current")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingTotal).toBe(180);
    expect(res.body.billsPendingCount).toBe(1);
    expect(res.body.adjustedProjectedBalance).toBe(
      Number((res.body.projectedBalance - 180).toFixed(2)),
    );
    expect(res.body.bankLimit).toMatchObject({
      total: 800,
      used: 80,
      status: "using",
    });
  });

  it("recompute com multiplas bills soma corretamente", async () => {
    const token = await registerAndLogin("fc-bills-multi@test.dev");

    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Aluguel", amount: 1200, dueDate: CURRENT_MONTH_END });
    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Luz", amount: 150.5, dueDate: CURRENT_MONTH_END });
    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Internet", amount: 99.9, dueDate: CURRENT_MONTH_END });

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.billsPendingCount).toBe(3);
    expect(res.body.billsPendingTotal).toBeCloseTo(1450.4, 1);
    expect(res.body.adjustedProjectedBalance).toBeCloseTo(
      res.body.projectedBalance - 1450.4,
      1,
    );
  });

  it("recompute expõe pendingItems com invoices e ciclos de cartão", async () => {
    const token = await registerAndLogin("fc-meta-pending-items@test.dev");
    const userId = await getUserIdByEmail("fc-meta-pending-items@test.dev");

    const cardResult = await dbQuery(
      `INSERT INTO credit_cards (user_id, name, limit_total, closing_day, due_day)
       VALUES ($1, 'Cartão principal', 5000, 20, 10)
       RETURNING id`,
      [userId],
    );
    const cardId = Number(cardResult.rows[0].id);

    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, status, bill_type, credit_card_id)
       VALUES ($1, 'Fatura de cartão', 700, $2, 'pending', 'credit_card_invoice', $3)`,
      [userId, CURRENT_MONTH_END, cardId],
    );

    await dbQuery(
      `INSERT INTO credit_card_purchases (user_id, credit_card_id, title, amount, purchase_date, status, statement_month)
       VALUES ($1, $2, 'Compra aberta', 120, $3, 'open', $4)`,
      [userId, cardId, CURRENT_MONTH_START, _now.toISOString().slice(0, 7)],
    );

    const res = await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body._meta.pendingItems).toMatchObject({
      bills: 1,
      invoices: 1,
      creditCardCycles: 1,
    });
  });
});

// ─── Forecast — statement-aware income (deterministic) ───────────────────────

// Helpers: insert an income_source + statement for a given user
const insertIncomeSource = async (userId, name = "Salário") => {
  const { rows } = await dbQuery(
    `INSERT INTO income_sources (user_id, name) VALUES ($1, $2) RETURNING id`,
    [userId, name],
  );
  return Number(rows[0].id);
};

const insertStatement = async (sourceId, { referenceMonth, netAmount, paymentDate, status = "draft" }) => {
  const { rows } = await dbQuery(
    `INSERT INTO income_statements
       (income_source_id, reference_month, net_amount, total_deductions, payment_date, status)
     VALUES ($1, $2, $3, 0, $4, $5)
     RETURNING id`,
    [sourceId, referenceMonth, netAmount, paymentDate ?? null, status],
  );
  return Number(rows[0].id);
};

describe("computeForecast — statement-aware income (deterministic)", () => {
  // FIXED_NOW = 2026-03-10; mEnd = 2026-03-31; currentMonth = '2026-03'
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("sem statements: fallback para salary quando payday ainda nao chegou", async () => {
    await registerAndLogin("fc-stmt-fallback@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-fallback@test.dev");

    await dbQuery(
      `INSERT INTO user_profiles (user_id, salary_monthly, payday) VALUES ($1, 4000, 31)`,
      [userId],
    );

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBe(4000);
    expect(result.projectedBalance).toBe(4000); // netToDate=0, adj=4000, daily=0
    expect(result._meta).toMatchObject({
      balanceBasis: "net_month_transactions",
      incomeBasis: "salary_profile_fallback",
    });
    expect(result._meta.fallbacksUsed).toContain("balanceBasis:net_month_transactions");
    expect(result._meta.fallbacksUsed).toContain("incomeBasis:salary_profile_fallback");
  });

  it("statement posted no mes: incomeAdjustment=0, incomeExpected=net_amount", async () => {
    await registerAndLogin("fc-stmt-posted@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-posted@test.dev");

    // salary exists but statement should win
    await dbQuery(
      `INSERT INTO user_profiles (user_id, salary_monthly, payday) VALUES ($1, 9000, 31)`,
      [userId],
    );

    const sid = await insertIncomeSource(userId);
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 5000,
      paymentDate: "2026-03-05", // already past, but status=posted
      status: "posted",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    // incomeExpected = 5000 (statement), not 9000 (salary)
    expect(result.incomeExpected).toBe(5000);
    // posted statement already in transactions — no cash adjustment
    expect(result.projectedBalance).toBe(0); // netToDate=0, adj=0, daily=0
    expect(result._meta).toMatchObject({
      incomeBasis: "confirmed_statement",
    });
    expect(result._meta.fallbacksUsed).not.toContain("incomeBasis:salary_profile_fallback");
  });

  it("statement draft com payment_date futuro: nao entra na projecao sem confirmacao", async () => {
    await registerAndLogin("fc-stmt-draft-future@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-draft-future@test.dev");

    const sid = await insertIncomeSource(userId);
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 3500,
      paymentDate: "2026-03-25", // future: > 2026-03-10
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBeNull();
    expect(result.projectedBalance).toBe(0);
  });

  it("statement draft com payment_date passada: permanece fora da projecao", async () => {
    await registerAndLogin("fc-stmt-draft-past@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-draft-past@test.dev");

    const sid = await insertIncomeSource(userId);
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 3500,
      paymentDate: "2026-03-05", // past: < 2026-03-10
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBeNull();
    expect(result.projectedBalance).toBe(0);
  });

  it("statement draft com payment_date em abril: nao entra no caixa de marco", async () => {
    await registerAndLogin("fc-stmt-next-month@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-next-month@test.dev");

    const sid = await insertIncomeSource(userId);
    // reference_month = 2026-03 (competência março), mas cai no caixa de abril
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 4200,
      paymentDate: "2026-04-02", // next month: > mEnd (2026-03-31)
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBeNull();
    expect(result.projectedBalance).toBe(0);
  });

  it("statement draft sem payment_date: nao entra no incomeAdjustment", async () => {
    await registerAndLogin("fc-stmt-no-date@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-no-date@test.dev");

    const sid = await insertIncomeSource(userId);
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 2800,
      paymentDate: null,
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBeNull();
    expect(result.projectedBalance).toBe(0);
  });

  it("statement posted com payment_date futuro: entra na projecao como renda confirmada", async () => {
    await registerAndLogin("fc-stmt-posted-future@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-posted-future@test.dev");

    const sid = await insertIncomeSource(userId);
    await insertStatement(sid, {
      referenceMonth: "2026-03",
      netAmount: 2800,
      paymentDate: "2026-03-20",
      status: "posted",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBe(2800);
    expect(result.projectedBalance).toBe(2800);
  });

  it("multiplas fontes: soma corretamente em income_expected e incomeAdjustment", async () => {
    await registerAndLogin("fc-stmt-multi@test.dev");
    const userId = await getUserIdByEmail("fc-stmt-multi@test.dev");

    const sid1 = await insertIncomeSource(userId, "Emprego principal");
    const sid2 = await insertIncomeSource(userId, "Freela");

    // posted — já na transação, não entra em adjustment
    await insertStatement(sid1, {
      referenceMonth: "2026-03",
      netAmount: 5000,
      paymentDate: "2026-03-05",
      status: "posted",
    });

    // draft com data futura — entra em adjustment
    await insertStatement(sid2, {
      referenceMonth: "2026-03",
      netAmount: 1500,
      paymentDate: "2026-03-20",
      status: "draft",
    });

    const result = await computeForecast(userId, { now: FIXED_NOW });

    expect(result.incomeExpected).toBe(5000);
    expect(result.projectedBalance).toBe(0);
  });
});
