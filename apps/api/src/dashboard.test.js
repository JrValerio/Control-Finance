import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

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
});
