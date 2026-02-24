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
import {
  expectErrorResponseWithRequestId,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("salary-profile", () => {
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
    await dbQuery("DELETE FROM salary_profiles");
    await dbQuery("DELETE FROM users");
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  it("GET /salary/profile bloqueia sem token", async () => {
    const res = await request(app).get("/salary/profile");
    expect(res.status).toBe(401);
  });

  it("PUT /salary/profile bloqueia sem token", async () => {
    const res = await request(app).put("/salary/profile").send({ gross_salary: 5000 });
    expect(res.status).toBe(401);
  });

  // ─── GET — 404 quando não existe ─────────────────────────────────────────

  it("GET /salary/profile retorna 404 quando usuario nao tem perfil", async () => {
    const token = await registerAndLogin("sal-get-404@test.dev");
    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);
    expectErrorResponseWithRequestId(res, 404, "Perfil salarial não encontrado.");
  });

  // ─── PUT — criação (upsert insert) ───────────────────────────────────────

  it("PUT /salary/profile cria perfil com campos minimos", async () => {
    const token = await registerAndLogin("sal-create@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      grossSalary: 5000,
      dependents:  0,
      paymentDay:  5,
    });
    expect(typeof res.body.id).toBe("number");
    expect(res.body.calculation).toBeDefined();
  });

  it("PUT /salary/profile cria perfil com todos os campos", async () => {
    const token = await registerAndLogin("sal-create-full@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 8000, dependents: 2, payment_day: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      grossSalary: 8000,
      dependents:  2,
      paymentDay:  10,
    });
  });

  // ─── PUT — atualização (upsert update) ───────────────────────────────────

  it("PUT /salary/profile atualiza perfil existente", async () => {
    const token = await registerAndLogin("sal-update@test.dev");

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 7500, dependents: 1, payment_day: 15 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      grossSalary: 7500,
      dependents:  1,
      paymentDay:  15,
    });
  });

  it("segundo upsert mantém mesmo id", async () => {
    const token = await registerAndLogin("sal-same-id@test.dev");

    const first = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    const second = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 6000 });

    expect(second.body.id).toBe(first.body.id);
  });

  // ─── GET — após criação ───────────────────────────────────────────────────

  it("GET /salary/profile retorna perfil criado com calculo", async () => {
    const token = await registerAndLogin("sal-get-ok@test.dev");

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, dependents: 1 });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ grossSalary: 5000, dependents: 1 });
    expect(res.body.calculation).toMatchObject({
      grossMonthly: 5000,
      inssMonthly:  expect.any(Number),
      irrfMonthly:  expect.any(Number),
      netMonthly:   expect.any(Number),
      netAnnual:    expect.any(Number),
      taxAnnual:    expect.any(Number),
    });
    expect(res.body.calculation.netMonthly).toBeGreaterThan(0);
    expect(res.body.calculation.netMonthly).toBeLessThan(5000);
  });

  // ─── Cálculo — sanidade 2026 ──────────────────────────────────────────────

  it("salario minimo 2026 R$1.621 — IRRF isento", async () => {
    const token = await registerAndLogin("sal-minimo@test.dev");

    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 1621 });

    expect(res.status).toBe(200);
    expect(res.body.calculation.irrfMonthly).toBe(0);
    expect(res.body.calculation.inssMonthly).toBe(
      Math.round(1621 * 0.075 * 100) / 100,
    );
  });

  it("effectiveYear nao aceito do client — calculo usa 2026", async () => {
    const token = await registerAndLogin("sal-year@test.dev");

    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, effectiveYear: 2020 }); // client tenta passar ano

    // campo desconhecido ignorado; calculo usa 2026 (default do motor)
    expect(res.status).toBe(200);
    expect(res.body.calculation.grossMonthly).toBe(5000);
  });

  // ─── Validação — gross_salary ─────────────────────────────────────────────

  it("PUT sem gross_salary retorna 422", async () => {
    const token = await registerAndLogin("sal-val-no-gross@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ dependents: 0 });
    expectErrorResponseWithRequestId(res, 422, "gross_salary é obrigatório.");
  });

  it("PUT gross_salary = 0 retorna 422", async () => {
    const token = await registerAndLogin("sal-val-zero@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 0 });
    expectErrorResponseWithRequestId(res, 422, "gross_salary deve ser um número positivo.");
  });

  it("PUT gross_salary negativo retorna 422", async () => {
    const token = await registerAndLogin("sal-val-neg@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: -500 });
    expectErrorResponseWithRequestId(res, 422, "gross_salary deve ser um número positivo.");
  });

  it("PUT gross_salary string nao numerica retorna 422", async () => {
    const token = await registerAndLogin("sal-val-str@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: "abc" });
    expectErrorResponseWithRequestId(res, 422, "gross_salary deve ser um número positivo.");
  });

  // ─── Validação — dependents ───────────────────────────────────────────────

  it("PUT dependents negativo retorna 422", async () => {
    const token = await registerAndLogin("sal-val-dep-neg@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, dependents: -1 });
    expectErrorResponseWithRequestId(res, 422, "dependents deve ser um inteiro não negativo.");
  });

  it("PUT dependents fracionario retorna 422", async () => {
    const token = await registerAndLogin("sal-val-dep-frac@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, dependents: 1.5 });
    expectErrorResponseWithRequestId(res, 422, "dependents deve ser um inteiro não negativo.");
  });

  // ─── Validação — payment_day ──────────────────────────────────────────────

  it("PUT payment_day = 0 retorna 422", async () => {
    const token = await registerAndLogin("sal-val-day-0@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, payment_day: 0 });
    expectErrorResponseWithRequestId(
      res,
      422,
      "payment_day deve ser um inteiro entre 1 e 31.",
    );
  });

  it("PUT payment_day = 32 retorna 422", async () => {
    const token = await registerAndLogin("sal-val-day-32@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, payment_day: 32 });
    expectErrorResponseWithRequestId(
      res,
      422,
      "payment_day deve ser um inteiro entre 1 e 31.",
    );
  });

  it("PUT payment_day = 31 aceito (limite superior)", async () => {
    const token = await registerAndLogin("sal-val-day-31@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, payment_day: 31 });
    expect(res.status).toBe(200);
    expect(res.body.paymentDay).toBe(31);
  });

  // ─── Ownership ────────────────────────────────────────────────────────────

  it("dois usuarios tem perfis independentes", async () => {
    const tokenA = await registerAndLogin("sal-owner-a@test.dev");
    const tokenB = await registerAndLogin("sal-owner-b@test.dev");

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ gross_salary: 5000 });

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ gross_salary: 10000 });

    const resA = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${tokenA}`);

    const resB = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resA.body.grossSalary).toBe(5000);
    expect(resB.body.grossSalary).toBe(10000);
    expect(resA.body.id).not.toBe(resB.body.id);
  });
});
