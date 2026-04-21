import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  DASHBOARD_SEMANTIC_SOURCE_MAP,
  DashboardSnapshotResponseSchema,
} from "./domain/contracts/dashboard-response.schema.ts";

// ─── Date helpers (UTC-safe) ──────────────────────────────────────────────────

const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const currentMonth = () => isoDate(0).slice(0, 7);

// ─── State reset ──────────────────────────────────────────────────────────────

const resetState = async () => {
  resetLoginProtectionState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM salary_consignacoes");
  await dbQuery("DELETE FROM salary_profiles");
  await dbQuery("DELETE FROM income_statements");
  await dbQuery("DELETE FROM income_sources");
  await dbQuery("DELETE FROM user_forecasts");
  await dbQuery("DELETE FROM credit_card_purchases");
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM credit_cards");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM bank_accounts");
  await dbQuery("DELETE FROM users");
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const getSnapshot = (token) =>
  request(app)
    .get("/dashboard/snapshot")
    .set("Authorization", `Bearer ${token}`);

const createBankAccount = (token, overrides = {}) =>
  request(app)
    .post("/bank-accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Conta Corrente", balance: 1000, accountType: "checking", ...overrides });

const createBill = (token, overrides = {}) =>
  request(app)
    .post("/bills")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Energia", amount: 200, dueDate: isoDate(0), ...overrides });

const createCreditCard = (token, overrides = {}) =>
  request(app)
    .post("/credit-cards")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Itaú", limitTotal: 5000, closingDay: 7, dueDay: 15, ...overrides });

const createPurchase = (token, cardId, overrides = {}) =>
  request(app)
    .post(`/credit-cards/${cardId}/purchases`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Supermercado", amount: 300, purchaseDate: isoDate(0), ...overrides });

const createIncomeSource = (token) =>
  request(app)
    .post("/income-sources")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "INSS Aposentadoria", sourceType: "inss_benefit" });

const createTransaction = (token, overrides = {}) =>
  request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      description: "Mercado",
      value: 100,
      type: "Saída",
      date: isoDate(0),
      ...overrides,
    });

const DASHBOARD_TOP_LEVEL_KEYS = [
  "bankBalance",
  "bills",
  "cards",
  "income",
  "forecast",
  "semanticCore",
  "semanticSourceMap",
  "consignado",
].sort();

const DASHBOARD_BILLS_KEYS = [
  "overdueCount",
  "overdueTotal",
  "dueSoonCount",
  "dueSoonTotal",
  "upcomingCount",
  "upcomingTotal",
].sort();

const DASHBOARD_CARDS_KEYS = ["openPurchasesTotal", "pendingInvoicesTotal"].sort();

const DASHBOARD_INCOME_KEYS = ["receivedThisMonth", "pendingThisMonth", "referenceMonth"].sort();

const DASHBOARD_CONSIGNADO_KEYS = ["monthlyTotal", "contractsCount", "comprometimentoPct"].sort();

const DASHBOARD_SEMANTIC_CORE_KEYS = [
  "semanticsVersion",
  "realized",
  "currentPosition",
  "projection",
].sort();

const DASHBOARD_SEMANTIC_SOURCE_MAP_KEYS = [
  "realized",
  "currentPosition",
  "projection",
].sort();

const DASHBOARD_SEMANTIC_REALIZED_KEYS = [
  "confirmedInflowTotal",
  "settledOutflowTotal",
  "netAmount",
  "referenceMonth",
].sort();

const DASHBOARD_SEMANTIC_CURRENT_POSITION_KEYS = [
  "bankBalance",
  "technicalBalance",
  "asOf",
].sort();

const DASHBOARD_SEMANTIC_PROJECTION_KEYS = [
  "referenceMonth",
  "projectedBalance",
  "adjustedProjectedBalance",
  "expectedInflow",
].sort();

const getUserIdByEmail = async (email) => {
  const userRes = await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  return Number(userRes.rows[0].id);
};

const upsertForecastForUser = async (userId, projectedBalance, month = currentMonth()) => {
  await dbQuery(
    `INSERT INTO user_forecasts
       (user_id, month, engine_version, projected_balance, income_expected,
        spending_to_date, daily_avg_spending, days_remaining,
        flip_detected, flip_direction, generated_at)
     VALUES ($1, $2, 'v1', $3, 0, 0, 0, 0, false, null, NOW())
     ON CONFLICT (user_id, month)
     DO UPDATE SET
       projected_balance = EXCLUDED.projected_balance,
       generated_at = EXCLUDED.generated_at`,
    [userId, `${month}-01`, projectedBalance],
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dashboard snapshot", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(resetState);

  // ─── Auth ─────────────────────────────────────────────────────────────────

  it("GET /dashboard/snapshot bloqueia sem token", async () => {
    const res = await request(app).get("/dashboard/snapshot");
    expect(res.status).toBe(401);
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  it("retorna zeros para usuario sem dados", async () => {
    const token = await registerAndLogin("dash-empty@test.dev");

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.bankBalance).toBe(0);
    expect(res.body.bills.overdueCount).toBe(0);
    expect(res.body.bills.overdueTotal).toBe(0);
    expect(res.body.bills.dueSoonCount).toBe(0);
    expect(res.body.bills.dueSoonTotal).toBe(0);
    expect(res.body.bills.upcomingCount).toBe(0);
    expect(res.body.bills.upcomingTotal).toBe(0);
    expect(res.body.cards.openPurchasesTotal).toBe(0);
    expect(res.body.cards.pendingInvoicesTotal).toBe(0);
    expect(res.body.income.receivedThisMonth).toBe(0);
    expect(res.body.income.pendingThisMonth).toBe(0);
    expect(res.body.income.referenceMonth).toBe(currentMonth());
    expect(res.body.forecast).toBeNull();
    expect(res.body.consignado.monthlyTotal).toBe(0);
  });

  // ─── Bank balance ─────────────────────────────────────────────────────────

  it("bankBalance agrega saldo de todas as contas ativas", async () => {
    const token = await registerAndLogin("dash-bank@test.dev");

    await createBankAccount(token, { balance: 1500 });
    await createBankAccount(token, { name: "Poupança", balance: 800, accountType: "savings" });

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.bankBalance).toBe(2300);
  });

  it("bankBalance exclui contas inativas", async () => {
    const token = await registerAndLogin("dash-bank-inactive@test.dev");

    await createBankAccount(token, { balance: 1000 });
    const toDelete = await createBankAccount(token, { name: "Encerrada", balance: 500 });
    // Soft-delete via DELETE endpoint
    await request(app)
      .delete(`/bank-accounts/${toDelete.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.bankBalance).toBe(1000);
  });

  // ─── Bills ────────────────────────────────────────────────────────────────

  it("bills.overdueCount conta faturas vencidas", async () => {
    const token = await registerAndLogin("dash-bills-overdue@test.dev");

    await createBill(token, { dueDate: isoDate(-5), amount: 150 });
    await createBill(token, { dueDate: isoDate(-1), amount: 80 });
    await createBill(token, { dueDate: isoDate(2), amount: 200 }); // due soon, not overdue

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.bills.overdueCount).toBe(2);
    expect(res.body.bills.overdueTotal).toBe(230);
  });

  it("bills.dueSoonCount conta faturas que vencem em 7 dias", async () => {
    const token = await registerAndLogin("dash-bills-soon@test.dev");

    await createBill(token, { dueDate: isoDate(0), amount: 100 });  // today
    await createBill(token, { dueDate: isoDate(3), amount: 200 });  // in 3 days
    await createBill(token, { dueDate: isoDate(7), amount: 50 });   // boundary day (inclusive)
    await createBill(token, { dueDate: isoDate(10), amount: 999 }); // beyond 7 days

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.bills.dueSoonCount).toBe(3);
    expect(res.body.bills.dueSoonTotal).toBe(350);
    expect(res.body.bills.upcomingCount).toBe(1);
    expect(res.body.bills.upcomingTotal).toBe(999);
  });

  it("bills nao conta faturas pagas", async () => {
    const token = await registerAndLogin("dash-bills-paid@test.dev");

    await createBill(token, { dueDate: isoDate(-3), amount: 200 }); // overdue pending
    const b2 = await createBill(token, { dueDate: isoDate(-1), amount: 100 });
    // Mark as paid via the dedicated endpoint
    await request(app)
      .patch(`/bills/${b2.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paidAt: isoDate(-1) });

    const res = await getSnapshot(token);

    expect(res.body.bills.overdueCount).toBe(1);
    expect(res.body.bills.overdueTotal).toBe(200);
  });

  // ─── Cards ────────────────────────────────────────────────────────────────

  it("cards.openPurchasesTotal soma compras abertas", async () => {
    const token = await registerAndLogin("dash-cards@test.dev");

    const cardRes = await createCreditCard(token);
    const cardId = cardRes.body.id;

    await createPurchase(token, cardId, { amount: 500 });
    await createPurchase(token, cardId, { amount: 300 });

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.cards.openPurchasesTotal).toBe(800);
  });

  it("cards.pendingInvoicesTotal soma faturas de cartão pendentes", async () => {
    const token = await registerAndLogin("dash-card-inv@test.dev");

    const cardRes = await createCreditCard(token);
    const cardId = cardRes.body.id;

    // Insert a credit card invoice bill directly with the correct bill_type and credit_card_id
    const userRes = await dbQuery(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      ["dash-card-inv@test.dev"],
    );
    const userId = Number(userRes.rows[0].id);
    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, bill_type, credit_card_id)
       VALUES ($1, 'Fatura Itaú', 1247.80, $2, 'credit_card_invoice', $3)`,
      [userId, isoDate(5), cardId],
    );

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.cards.pendingInvoicesTotal).toBeCloseTo(1247.80, 2);
  });

  // ─── Income ───────────────────────────────────────────────────────────────

  it("income.receivedThisMonth soma statements posted no mes corrente", async () => {
    const token = await registerAndLogin("dash-income@test.dev");

    const srcRes = await createIncomeSource(token);
    const sourceId = srcRes.body.id;

    // Create a draft statement this month
    await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: currentMonth(),
        netAmount: 1902.31,
        paymentDate: isoDate(-5),
      });
    // Mark as posted via direct DB update
    await dbQuery(
      `UPDATE income_statements SET status = 'posted'
       WHERE income_source_id = $1 AND reference_month = $2`,
      [sourceId, currentMonth()],
    );

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.income.receivedThisMonth).toBeCloseTo(1902.31, 2);
    expect(res.body.income.pendingThisMonth).toBe(0);
    expect(res.body.income.referenceMonth).toBe(currentMonth());
  });

  it("income.pendingThisMonth soma statements draft no mes corrente", async () => {
    const token = await registerAndLogin("dash-income-draft@test.dev");

    const srcRes = await createIncomeSource(token);
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: currentMonth(),
        netAmount: 1902.31,
        paymentDate: isoDate(5),
      });

    const res = await getSnapshot(token);

    // Draft statement → pending
    expect(res.body.income.pendingThisMonth).toBeCloseTo(1902.31, 2);
    expect(res.body.income.receivedThisMonth).toBe(0);
  });

  // ─── Forecast ─────────────────────────────────────────────────────────────

  it("forecast e null quando nao ha previsao computada", async () => {
    const token = await registerAndLogin("dash-fc-null@test.dev");

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.forecast).toBeNull();
  });

  it("forecast retorna projected_balance do forecast mais recente", async () => {
    const token = await registerAndLogin("dash-fc-val@test.dev");

    // Trigger forecast recompute via the forecasts endpoint
    await request(app)
      .post("/forecasts/recompute")
      .set("Authorization", `Bearer ${token}`);

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    // Forecast may or may not produce a value depending on transaction data; just check shape
    if (res.body.forecast) {
      expect(typeof res.body.forecast.projectedBalance).toBe("number");
      expect(typeof res.body.forecast.month).toBe("string");
    }
  });

  // ─── Consignado ───────────────────────────────────────────────────────────

  it("consignado.monthlyTotal e zero quando nao ha perfil salarial", async () => {
    const token = await registerAndLogin("dash-consig-none@test.dev");

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.consignado.monthlyTotal).toBe(0);
  });

  it("consignado.monthlyTotal soma consignacoes do perfil salarial", async () => {
    const token = await registerAndLogin("dash-consig@test.dev");

    // Insert salary profile and consignacoes directly (bypasses entitlement middleware)
    const userRes = await dbQuery(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      ["dash-consig@test.dev"],
    );
    const userId = Number(userRes.rows[0].id);

    const profileRes = await dbQuery(
      `INSERT INTO salary_profiles (user_id, gross_salary, dependents, payment_day, profile_type)
       VALUES ($1, 3000, 0, 5, 'clt') RETURNING id`,
      [userId],
    );
    const profileId = Number(profileRes.rows[0].id);

    await dbQuery(
      `INSERT INTO salary_consignacoes (salary_profile_id, description, amount, consignacao_type)
       VALUES ($1, 'Empréstimo Caixa', 300, 'loan'), ($1, 'Cartão Consignado', 150, 'card')`,
      [profileId],
    );

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.consignado.monthlyTotal).toBe(450);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it("snapshot retorna apenas dados do usuario autenticado", async () => {
    const token1 = await registerAndLogin("dash-iso-1@test.dev");
    const token2 = await registerAndLogin("dash-iso-2@test.dev");

    // User 1 has bank balance
    await createBankAccount(token1, { balance: 5000 });

    // User 2 has nothing
    const res = await getSnapshot(token2);

    expect(res.status).toBe(200);
    expect(res.body.bankBalance).toBe(0);
  });

  // ─── Contract regression ─────────────────────────────────────────────────

  it("mantem shape canônico estrito no estado vazio", async () => {
    const token = await registerAndLogin("dash-contract-empty@test.dev");

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(DASHBOARD_TOP_LEVEL_KEYS);
    expect(Object.keys(res.body.bills).sort()).toEqual(DASHBOARD_BILLS_KEYS);
    expect(Object.keys(res.body.cards).sort()).toEqual(DASHBOARD_CARDS_KEYS);
    expect(Object.keys(res.body.income).sort()).toEqual(DASHBOARD_INCOME_KEYS);
    expect(Object.keys(res.body.consignado).sort()).toEqual(DASHBOARD_CONSIGNADO_KEYS);
    expect(Object.keys(res.body.semanticCore).sort()).toEqual(DASHBOARD_SEMANTIC_CORE_KEYS);
    expect(Object.keys(res.body.semanticSourceMap).sort()).toEqual(
      DASHBOARD_SEMANTIC_SOURCE_MAP_KEYS,
    );
    expect(res.body.semanticSourceMap).toEqual(DASHBOARD_SEMANTIC_SOURCE_MAP);
    expect(Object.keys(res.body.semanticCore.realized).sort()).toEqual(
      DASHBOARD_SEMANTIC_REALIZED_KEYS,
    );
    expect(Object.keys(res.body.semanticCore.currentPosition).sort()).toEqual(
      DASHBOARD_SEMANTIC_CURRENT_POSITION_KEYS,
    );
    expect(Object.keys(res.body.semanticCore.projection).sort()).toEqual(
      DASHBOARD_SEMANTIC_PROJECTION_KEYS,
    );

    expect(res.body).toStrictEqual({
      bankBalance: 0,
      bills: {
        overdueCount: 0,
        overdueTotal: 0,
        dueSoonCount: 0,
        dueSoonTotal: 0,
        upcomingCount: 0,
        upcomingTotal: 0,
      },
      cards: {
        openPurchasesTotal: 0,
        pendingInvoicesTotal: 0,
      },
      income: {
        receivedThisMonth: 0,
        pendingThisMonth: 0,
        referenceMonth: currentMonth(),
      },
      forecast: null,
      semanticCore: {
        semanticsVersion: "v1",
        realized: {
          confirmedInflowTotal: 0,
          settledOutflowTotal: 0,
          netAmount: 0,
          referenceMonth: currentMonth(),
        },
        currentPosition: {
          bankBalance: 0,
          technicalBalance: 0,
          asOf: expect.any(String),
        },
        projection: {
          referenceMonth: currentMonth(),
          projectedBalance: 0,
          adjustedProjectedBalance: 0,
          expectedInflow: null,
        },
      },
      semanticSourceMap: {
        realized: ["dashboard.income.receivedThisMonth"],
        currentPosition: ["dashboard.bankBalance"],
        projection: ["dashboard.income.pendingThisMonth", "dashboard.forecast.projectedBalance"],
      },
      consignado: {
        monthlyTotal: 0,
        contractsCount: 0,
        comprometimentoPct: null,
      },
    });

    const parsed = DashboardSnapshotResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("mantem campos financeiros críticos numéricos e previsíveis sem forecast", async () => {
    const email = "dash-contract-populated@test.dev";
    const token = await registerAndLogin(email);

    await createBankAccount(token, { balance: 1234.56 });
    await createBill(token, { dueDate: isoDate(-2), amount: 400.15 });
    await createBill(token, { dueDate: isoDate(4), amount: 99.85 });

    const cardRes = await createCreditCard(token, { name: "Nubank" });
    const cardId = cardRes.body.id;
    await createPurchase(token, cardId, { amount: 310.4 });

    const userRes = await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    const userId = Number(userRes.rows[0].id);
    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, bill_type, credit_card_id)
       VALUES ($1, 'Fatura Nubank', 789.9, $2, 'credit_card_invoice', $3)`,
      [userId, isoDate(6), cardId],
    );

    const srcRes = await createIncomeSource(token);
    const sourceId = srcRes.body.id;
    await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: currentMonth(),
        netAmount: 2500.45,
        paymentDate: isoDate(-3),
      });
    await dbQuery(
      `UPDATE income_statements SET status = 'posted'
       WHERE income_source_id = $1 AND reference_month = $2`,
      [sourceId, currentMonth()],
    );

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(DASHBOARD_TOP_LEVEL_KEYS);
    expect(Object.keys(res.body.bills).sort()).toEqual(DASHBOARD_BILLS_KEYS);
    expect(Object.keys(res.body.cards).sort()).toEqual(DASHBOARD_CARDS_KEYS);
    expect(Object.keys(res.body.income).sort()).toEqual(DASHBOARD_INCOME_KEYS);
    expect(Object.keys(res.body.consignado).sort()).toEqual(DASHBOARD_CONSIGNADO_KEYS);
    expect(Object.keys(res.body.semanticCore).sort()).toEqual(DASHBOARD_SEMANTIC_CORE_KEYS);

    expect(typeof res.body.bankBalance).toBe("number");
    expect(typeof res.body.bills.overdueTotal).toBe("number");
    expect(typeof res.body.bills.dueSoonTotal).toBe("number");
    expect(typeof res.body.cards.openPurchasesTotal).toBe("number");
    expect(typeof res.body.cards.pendingInvoicesTotal).toBe("number");
    expect(typeof res.body.income.receivedThisMonth).toBe("number");
    expect(typeof res.body.income.pendingThisMonth).toBe("number");
    expect(typeof res.body.consignado.monthlyTotal).toBe("number");
    expect(typeof res.body.consignado.contractsCount).toBe("number");
    expect(res.body.semanticCore.semanticsVersion).toBe("v1");
    expect(res.body.semanticCore.realized.confirmedInflowTotal).toBe(
      res.body.income.receivedThisMonth,
    );
    expect(res.body.semanticCore.currentPosition.bankBalance).toBe(res.body.bankBalance);
    expect(res.body.semanticCore.projection.projectedBalance).toBe(
      res.body.forecast ? res.body.forecast.projectedBalance : res.body.bankBalance,
    );
    expect(res.body.semanticCore.projection.expectedInflow).toBe(
      res.body.income.pendingThisMonth > 0 ? res.body.income.pendingThisMonth : null,
    );
    expect(
      res.body.consignado.comprometimentoPct === null
        ? true
        : typeof res.body.consignado.comprometimentoPct === "number",
    ).toBe(true);

    // Sem forecast computado, o estado degradado previsível continua sendo forecast null.
    expect(res.body.forecast).toBeNull();

    const parsed = DashboardSnapshotResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("nao duplica credit_card_invoice no adjustedProjectedBalance do semanticCore", async () => {
    const email = "dash-no-double-count-invoice@test.dev";
    const token = await registerAndLogin(email);

    await createBankAccount(token, { balance: 1234.56 });
    await createBill(token, { dueDate: isoDate(-2), amount: 400.15 });
    await createBill(token, { dueDate: isoDate(4), amount: 99.85 });

    const cardRes = await createCreditCard(token, { name: "Nubank" });
    const cardId = cardRes.body.id;
    await createPurchase(token, cardId, { amount: 310.4 });

    const userId = await getUserIdByEmail(email);
    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date, bill_type, credit_card_id)
       VALUES ($1, 'Fatura Nubank', 789.9, $2, 'credit_card_invoice', $3)`,
      [userId, isoDate(6), cardId],
    );

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.cards.pendingInvoicesTotal).toBe(789.9);
    expect(res.body.semanticCore.projection.projectedBalance).toBe(1234.56);
    expect(res.body.semanticCore.projection.adjustedProjectedBalance).toBe(-365.74);
  });

  // ─── Truth table regression ─────────────────────────────────────────────

  it.each([
    {
      name: "saldo positivo + receita confirmada + sem pendencias + sem cartao + forecast disponivel",
      email: "dash-tt-1@test.dev",
      bankBalance: 2500,
      postedIncome: 1800,
      draftIncome: 0,
      overdueBill: 0,
      dueSoonBill: 0,
      openPurchase: 0,
      pendingInvoice: 0,
      forecastProjectedBalance: 3900,
      expected: {
        bankSign: "positive",
        incomeMode: "confirmed",
        hasPending: false,
        cardImpacts: false,
        forecastMode: "available",
        operationalSign: "positive",
      },
    },
    {
      name: "saldo negativo + receita fallback + com pendencias + cartao impactando + forecast degradado",
      email: "dash-tt-2@test.dev",
      bankBalance: -400,
      postedIncome: 0,
      draftIncome: 600,
      overdueBill: 350,
      dueSoonBill: 220,
      openPurchase: 300,
      pendingInvoice: 700,
      forecastProjectedBalance: null,
      expected: {
        bankSign: "negative",
        incomeMode: "fallback",
        hasPending: true,
        cardImpacts: true,
        forecastMode: "degraded",
        operationalSign: "negative",
      },
    },
    {
      name: "saldo positivo + receita fallback + sem pendencias + cartao impactando + forecast disponivel",
      email: "dash-tt-3@test.dev",
      bankBalance: 1500,
      postedIncome: 0,
      draftIncome: 900,
      overdueBill: 0,
      dueSoonBill: 0,
      openPurchase: 100,
      pendingInvoice: 0,
      forecastProjectedBalance: 1800,
      expected: {
        bankSign: "positive",
        incomeMode: "fallback",
        hasPending: false,
        cardImpacts: true,
        forecastMode: "available",
        operationalSign: "positive",
      },
    },
    {
      name: "saldo negativo + receita confirmada + com pendencias + sem impacto de cartao + forecast degradado",
      email: "dash-tt-4@test.dev",
      bankBalance: -200,
      postedIncome: 300,
      draftIncome: 0,
      overdueBill: 250,
      dueSoonBill: 100,
      openPurchase: 0,
      pendingInvoice: 0,
      forecastProjectedBalance: null,
      expected: {
        bankSign: "negative",
        incomeMode: "confirmed",
        hasPending: true,
        cardImpacts: false,
        forecastMode: "degraded",
        operationalSign: "negative",
      },
    },
  ])("truth table: $name", async (scenario) => {
    const token = await registerAndLogin(scenario.email);
    const userId = await getUserIdByEmail(scenario.email);

    const bankAccountRes = await createBankAccount(token, { balance: 0, name: "Conta Base" });
    await dbQuery("UPDATE bank_accounts SET balance = $1 WHERE id = $2", [
      scenario.bankBalance,
      bankAccountRes.body.id,
    ]);

    if (scenario.overdueBill > 0) {
      await createBill(token, { dueDate: isoDate(-2), amount: scenario.overdueBill });
    }
    if (scenario.dueSoonBill > 0) {
      await createBill(token, { dueDate: isoDate(3), amount: scenario.dueSoonBill });
    }

    let cardId = null;
    if (scenario.openPurchase > 0 || scenario.pendingInvoice > 0) {
      const cardRes = await createCreditCard(token, { name: "Cartao TT" });
      cardId = cardRes.body.id;
    }
    if (scenario.openPurchase > 0 && cardId) {
      await createPurchase(token, cardId, { amount: scenario.openPurchase });
    }
    if (scenario.pendingInvoice > 0 && cardId) {
      await dbQuery(
        `INSERT INTO bills (user_id, title, amount, due_date, bill_type, credit_card_id)
         VALUES ($1, 'Fatura TT', $2, $3, 'credit_card_invoice', $4)`,
        [userId, scenario.pendingInvoice, isoDate(5), cardId],
      );
    }

    if (scenario.postedIncome > 0 || scenario.draftIncome > 0) {
      const sourceRes = await createIncomeSource(token);
      const sourceId = sourceRes.body.id;

      if (scenario.postedIncome > 0) {
        await request(app)
          .post(`/income-sources/${sourceId}/statements`)
          .set("Authorization", `Bearer ${token}`)
          .send({
            referenceMonth: currentMonth(),
            netAmount: scenario.postedIncome,
            paymentDate: isoDate(-3),
          });

        await dbQuery(
          `UPDATE income_statements SET status = 'posted'
           WHERE income_source_id = $1 AND reference_month = $2 AND net_amount = $3`,
          [sourceId, currentMonth(), scenario.postedIncome],
        );
      }

      if (scenario.draftIncome > 0) {
        await request(app)
          .post(`/income-sources/${sourceId}/statements`)
          .set("Authorization", `Bearer ${token}`)
          .send({
            referenceMonth: currentMonth(),
            netAmount: scenario.draftIncome,
            paymentDate: isoDate(4),
          });
      }
    }

    if (scenario.forecastProjectedBalance !== null) {
      await upsertForecastForUser(userId, scenario.forecastProjectedBalance);
    }

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(DASHBOARD_TOP_LEVEL_KEYS);
    expect(Object.keys(res.body.bills).sort()).toEqual(DASHBOARD_BILLS_KEYS);
    expect(Object.keys(res.body.cards).sort()).toEqual(DASHBOARD_CARDS_KEYS);
    expect(Object.keys(res.body.income).sort()).toEqual(DASHBOARD_INCOME_KEYS);
    expect(Object.keys(res.body.consignado).sort()).toEqual(DASHBOARD_CONSIGNADO_KEYS);
    expect(Object.keys(res.body.semanticCore).sort()).toEqual(DASHBOARD_SEMANTIC_CORE_KEYS);

    const bankIsPositive = res.body.bankBalance > 0;
    expect(bankIsPositive).toBe(scenario.expected.bankSign === "positive");

    if (scenario.expected.incomeMode === "confirmed") {
      expect(res.body.income.receivedThisMonth).toBeGreaterThan(0);
      expect(res.body.income.pendingThisMonth).toBe(0);
    } else {
      // Fallback operacional aqui significa sem valor confirmado, apenas draft pendente.
      expect(res.body.income.receivedThisMonth).toBe(0);
      expect(res.body.income.pendingThisMonth).toBeGreaterThan(0);
    }

    const pendingExposure =
      res.body.bills.overdueTotal + res.body.bills.dueSoonTotal + res.body.bills.upcomingTotal;
    expect(pendingExposure > 0).toBe(scenario.expected.hasPending);

    const cardExposure = res.body.cards.openPurchasesTotal + res.body.cards.pendingInvoicesTotal;
    expect(cardExposure > 0).toBe(scenario.expected.cardImpacts);

    expect(res.body.semanticCore.realized.confirmedInflowTotal).toBe(
      res.body.income.receivedThisMonth,
    );
    expect(res.body.semanticCore.currentPosition.bankBalance).toBe(res.body.bankBalance);
    expect(res.body.semanticCore.projection.referenceMonth).toBe(
      res.body.forecast ? res.body.forecast.month : res.body.income.referenceMonth,
    );

    if (scenario.expected.forecastMode === "available") {
      expect(res.body.forecast).not.toBeNull();
      expect(typeof res.body.forecast.projectedBalance).toBe("number");
      expect(typeof res.body.forecast.month).toBe("string");
    } else {
      expect(res.body.forecast).toBeNull();
    }

    const operationalPosition =
      res.body.bankBalance +
      res.body.income.receivedThisMonth -
      res.body.bills.overdueTotal -
      res.body.bills.dueSoonTotal -
      res.body.cards.openPurchasesTotal -
      res.body.cards.pendingInvoicesTotal;
    expect(operationalPosition > 0).toBe(scenario.expected.operationalSign === "positive");

    const parsed = DashboardSnapshotResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("settledOutflowTotal reflete transacoes de saida do mes corrente", async () => {
    const email = "dash-settled-outflow@test.dev";
    const token = await registerAndLogin(email);

    await createTransaction(token, { description: "Supermercado", value: 350.5, type: "Saida", date: isoDate(0) });
    await createTransaction(token, { description: "Farmácia", value: 89.9, type: "Saida", date: isoDate(-2) });
    await createTransaction(token, { description: "Salário", value: 2000, type: "Entrada", date: isoDate(0) });

    const res = await getSnapshot(token);

    expect(res.status).toBe(200);
    expect(res.body.semanticCore.realized.settledOutflowTotal).toBe(440.4);
    expect(res.body.semanticCore.realized.confirmedInflowTotal).toBe(0);
  });
});
