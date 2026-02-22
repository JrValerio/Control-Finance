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

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM user_forecasts");
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
    expect(res.body.engineVersion).toBe("v1");
    expect(res.body.incomeExpected).toBeNull();
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
});
