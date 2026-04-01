import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

// ─── Date helpers ────────────────────────────────────────────────────────────
// All dates use local-time arithmetic, matching how bills.service.js computes today.

const localDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const TODAY = localDate(0);
const YESTERDAY = localDate(-1);
const IN_7_DAYS = localDate(7);
const IN_8_DAYS = localDate(8);
const IN_30_DAYS = localDate(30);
const PAST_30 = localDate(-30);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const createBill = (token, overrides = {}) =>
  request(app)
    .post("/bills")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Conta de Energia",
      amount: 150,
      dueDate: IN_30_DAYS,
      billType: "energy",
      ...overrides,
    });

const getPanel = (token) =>
  request(app)
    .get("/bills/utility-panel")
    .set("Authorization", `Bearer ${token}`);

// ─── Setup ───────────────────────────────────────────────────────────────────

describe("GET /bills/utility-panel", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM users");
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/bills/utility-panel");
    expect(res.status).toBe(401);
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  it("retorna buckets vazios quando usuario nao tem contas de consumo", async () => {
    const token = await registerAndLogin("util-empty@test.dev");

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.overdue).toHaveLength(0);
    expect(res.body.dueSoon).toHaveLength(0);
    expect(res.body.upcoming).toHaveLength(0);
    expect(res.body.summary.totalPending).toBe(0);
    expect(res.body.summary.totalAmount).toBe(0);
    expect(res.body.summary.overdueCount).toBe(0);
    expect(res.body.summary.dueSoonCount).toBe(0);
  });

  // ─── Bucket boundaries ────────────────────────────────────────────────────

  it("conta com vencimento ontem vai para overdue", async () => {
    const token = await registerAndLogin("util-yesterday@test.dev");
    await createBill(token, { dueDate: YESTERDAY, title: "Energia vencida" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.overdue).toHaveLength(1);
    expect(res.body.overdue[0].title).toBe("Energia vencida");
    expect(res.body.dueSoon).toHaveLength(0);
    expect(res.body.upcoming).toHaveLength(0);
  });

  it("conta com vencimento hoje vai para dueSoon", async () => {
    const token = await registerAndLogin("util-today@test.dev");
    await createBill(token, { dueDate: TODAY, title: "Água vence hoje" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.overdue).toHaveLength(0);
    expect(res.body.dueSoon).toHaveLength(1);
    expect(res.body.dueSoon[0].title).toBe("Água vence hoje");
  });

  it("conta com vencimento em 7 dias vai para dueSoon (limite inclusive)", async () => {
    const token = await registerAndLogin("util-7days@test.dev");
    await createBill(token, { dueDate: IN_7_DAYS, title: "Internet 7 dias" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.dueSoon).toHaveLength(1);
    expect(res.body.dueSoon[0].title).toBe("Internet 7 dias");
    expect(res.body.overdue).toHaveLength(0);
    expect(res.body.upcoming).toHaveLength(0);
  });

  it("conta com vencimento em 8 dias vai para upcoming (fora da janela dueSoon)", async () => {
    const token = await registerAndLogin("util-8days@test.dev");
    await createBill(token, { dueDate: IN_8_DAYS, title: "Gás próxima semana" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.upcoming).toHaveLength(1);
    expect(res.body.upcoming[0].title).toBe("Gás próxima semana");
    expect(res.body.overdue).toHaveLength(0);
    expect(res.body.dueSoon).toHaveLength(0);
  });

  it("mistura de buckets: distribui corretamente e totaliza summary", async () => {
    const token = await registerAndLogin("util-mixed@test.dev");

    await createBill(token, { dueDate: PAST_30, amount: 110, title: "Energia vencida" });
    await createBill(token, { dueDate: YESTERDAY, amount: 90, title: "Água vencida", billType: "water" });
    await createBill(token, { dueDate: TODAY, amount: 75, title: "Internet hoje", billType: "internet" });
    await createBill(token, { dueDate: IN_7_DAYS, amount: 55, title: "Telefone em breve", billType: "phone" });
    await createBill(token, { dueDate: IN_8_DAYS, amount: 40, title: "Gás próximo", billType: "gas" });
    await createBill(token, { dueDate: IN_30_DAYS, amount: 60, title: "Energia futura" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.overdue).toHaveLength(2);
    expect(res.body.dueSoon).toHaveLength(2);
    expect(res.body.upcoming).toHaveLength(2);

    expect(res.body.summary.overdueCount).toBe(2);
    expect(res.body.summary.overdueAmount).toBeCloseTo(200);
    expect(res.body.summary.dueSoonCount).toBe(2);
    expect(res.body.summary.dueSoonAmount).toBeCloseTo(130);
    expect(res.body.summary.totalPending).toBe(6);
    expect(res.body.summary.totalAmount).toBeCloseTo(430);
  });

  // ─── bill_type filter ─────────────────────────────────────────────────────

  it("exclui bills sem bill_type de consumo (outros tipos)", async () => {
    const token = await registerAndLogin("util-filter-type@test.dev");

    // These should be excluded
    await createBill(token, { billType: "rent", title: "Aluguel" });
    await createBill(token, { billType: "other", title: "Outro" });
    await createBill(token, { billType: null, title: "Sem tipo" });

    // This should be included
    await createBill(token, { billType: "energy", title: "Energia incluída", dueDate: IN_30_DAYS });
    await createBill(token, { billType: "tv", title: "TV incluída", dueDate: IN_30_DAYS });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalPending).toBe(2);
    const allBills = [...res.body.overdue, ...res.body.dueSoon, ...res.body.upcoming];
    const titles = allBills.map((bill) => bill.title);
    expect(titles).toContain("Energia incluída");
    expect(titles).toContain("TV incluída");
  });

  it("exclui contas ja pagas", async () => {
    const token = await registerAndLogin("util-paid@test.dev");

    // Create and pay one bill
    const created = await createBill(token, { dueDate: IN_7_DAYS, title: "Energia paga" });
    await request(app)
      .patch(`/bills/${created.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    // One still pending
    await createBill(token, { dueDate: IN_7_DAYS, title: "Água pendente", billType: "water" });

    const res = await getPanel(token);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalPending).toBe(1);
    const allBills = [...res.body.overdue, ...res.body.dueSoon, ...res.body.upcoming];
    expect(allBills[0].title).toBe("Água pendente");
  });

  // ─── Isolation ────────────────────────────────────────────────────────────

  it("nao retorna contas de outro usuario", async () => {
    const tokenA = await registerAndLogin("util-isolation-a@test.dev");
    const tokenB = await registerAndLogin("util-isolation-b@test.dev");

    await createBill(tokenA, { title: "Conta do usuário A" });

    const res = await getPanel(tokenB);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalPending).toBe(0);
  });

  // ─── Response shape ───────────────────────────────────────────────────────

  it("campos de bill estao presentes no response", async () => {
    const token = await registerAndLogin("util-shape@test.dev");
    await createBill(token, {
      title: "Energia",
      amount: 200,
      dueDate: IN_30_DAYS,
      billType: "energy",
      provider: "ENEL",
      referenceMonth: "2026-03",
    });

    const res = await getPanel(token);
    const bill = res.body.upcoming[0];

    expect(bill).toMatchObject({
      title: "Energia",
      amount: 200,
      dueDate: IN_30_DAYS,
      billType: "energy",
      provider: "ENEL",
      referenceMonth: "2026-03",
      status: "pending",
    });
    expect(Number.isInteger(bill.id)).toBe(true);
  });
});
