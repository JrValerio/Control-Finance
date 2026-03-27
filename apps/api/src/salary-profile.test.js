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
  makeProUser,
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
    await dbQuery("DELETE FROM salary_consignacoes");
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

  it("PUT /salary/profile/imported-benefit sincroniza perfil INSS e substitui consignacoes", async () => {
    const token = await registerAndLogin("sal-imported-benefit@test.dev");

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 3000, dependents: 2, payment_day: 5, profile_type: "clt" });

    await request(app)
      .put("/salary/profile/imported-benefit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gross_salary: 4958.67,
        payment_day: 7,
        birth_year: 1955,
        consignacoes: [
          {
            description: "216 CONSIGNACAO EMPRESTIMO BANCARIO",
            amount: 156,
            consignacao_type: "loan",
          },
          {
            description: "268 CONSIGNACAO - CARTAO",
            amount: 247.93,
            consignacao_type: "card",
          },
        ],
      });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      profileType: "inss_beneficiary",
      grossSalary: 4958.67,
      dependents: 2,
      paymentDay: 7,
      birthYear: 1955,
    });
    expect(res.body.consignacoes).toEqual([
      expect.objectContaining({
        description: "216 CONSIGNACAO EMPRESTIMO BANCARIO",
        amount: 156,
        consignacaoType: "loan",
      }),
      expect.objectContaining({
        description: "268 CONSIGNACAO - CARTAO",
        amount: 247.93,
        consignacaoType: "card",
      }),
    ]);
  });

  it("PUT /salary/profile/imported-benefit nao duplica consignacoes ao ressincronizar", async () => {
    const token = await registerAndLogin("sal-imported-benefit-idempotent@test.dev");

    const payload = {
      gross_salary: 4958.67,
      payment_day: 7,
      birth_year: 1955,
      consignacoes: [
        {
          description: "216 CONSIGNACAO EMPRESTIMO BANCARIO",
          amount: 156,
          consignacao_type: "loan",
        },
        {
          description: "217 EMPRESTIMO SOBRE A RMC",
          amount: 238,
          consignacao_type: "loan",
        },
      ],
    };

    await request(app)
      .put("/salary/profile/imported-benefit")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    await request(app)
      .put("/salary/profile/imported-benefit")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.consignacoes).toHaveLength(2);
    expect(res.body.consignacoes.map((item) => item.description)).toEqual([
      "216 CONSIGNACAO EMPRESTIMO BANCARIO",
      "217 EMPRESTIMO SOBRE A RMC",
    ]);
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

  // ─── Paywall — projeção anual ─────────────────────────────────────────────

  it("free user (trial expirado) recebe null em netAnnual e taxAnnual", async () => {
    const email = "sal-paywall-free@test.dev";
    const token = await registerAndLogin(email);

    // expire the trial so the user falls back to the free plan
    await dbQuery(
      "UPDATE users SET trial_ends_at = '2020-01-01T00:00:00Z' WHERE email = $1",
      [email],
    );

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.calculation.netMonthly).toBe("number");
    expect(res.body.calculation.netMonthly).toBeGreaterThan(0);
    expect(res.body.calculation.netAnnual).toBeNull();
    expect(res.body.calculation.taxAnnual).toBeNull();
  });

  it("free user beneficiario mantem consignacoes e limites mensais visiveis", async () => {
    const email = "sal-paywall-beneficiary-free@test.dev";
    const token = await registerAndLogin(email);

    await dbQuery(
      "UPDATE users SET trial_ends_at = '2020-01-01T00:00:00Z' WHERE email = $1",
      [email],
    );

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Emprestimo", amount: 500, consignacao_type: "loan" });

    await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Cartao", amount: 100, consignacao_type: "card" });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.calculation).toMatchObject({
      netAnnual: null,
      taxAnnual: null,
      consignacoesMonthly: 600,
      loanTotal: 500,
      cardTotal: 100,
      loanLimitAmount: 1400,
      cardLimitAmount: 200,
      isOverLoanLimit: false,
      isOverCardLimit: false,
    });
    expect(res.body.consignacoes).toHaveLength(2);
  });

  it("usuario pro recebe netAnnual e taxAnnual numericos", async () => {
    const email = "sal-paywall-pro@test.dev";
    const token = await registerAndLogin(email);

    // expire trial so access comes exclusively from the pro subscription
    await dbQuery(
      "UPDATE users SET trial_ends_at = '2020-01-01T00:00:00Z' WHERE email = $1",
      [email],
    );
    await makeProUser(email);

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.calculation.netAnnual).toBe("number");
    expect(typeof res.body.calculation.taxAnnual).toBe("number");
    expect(res.body.calculation.netAnnual).toBeGreaterThan(0);
  });

  // ─── profile_type ─────────────────────────────────────────────────────────

  it("PUT sem profile_type padrão é clt", async () => {
    const token = await registerAndLogin("sal-type-default@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.profileType).toBe("clt");
  });

  it("PUT profile_type inss_beneficiary persiste e usa calculadora de benefício", async () => {
    const token = await registerAndLogin("sal-type-inss@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4958.67, profile_type: "inss_beneficiary", birth_year: 1955 });

    expect(res.status).toBe(200);
    expect(res.body.profileType).toBe("inss_beneficiary");
    expect(res.body.birthYear).toBe(1955);
    // beneficiário tem inssMonthly = 0
    expect(res.body.calculation.inssMonthly).toBe(0);
    // líquido mensal reflete o valor recebido, sem descontar IRRF estimado
    expect(res.body.calculation.netMonthly).toBeCloseTo(4958.67, 2);
    // consignações incluídas como array vazio
    expect(res.body.consignacoes).toEqual([]);
  });

  it("PUT profile_type inválido retorna 422", async () => {
    const token = await registerAndLogin("sal-type-invalid@test.dev");
    const res = await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 5000, profile_type: "autonomo" });

    expect(res.status).toBe(422);
  });

  // ─── Consignações — POST ──────────────────────────────────────────────────

  it("POST /salary/consignacoes bloqueia sem token", async () => {
    const res = await request(app)
      .post("/salary/consignacoes")
      .send({ description: "Test", amount: 100, consignacao_type: "loan" });
    expect(res.status).toBe(401);
  });

  it("POST /salary/consignacoes retorna 404 se não tem perfil", async () => {
    const token = await registerAndLogin("sal-consig-noprofile@test.dev");
    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "BMG", amount: 300, consignacao_type: "loan" });
    expectErrorResponseWithRequestId(res, 404, "Perfil salarial não encontrado.");
  });

  it("POST /salary/consignacoes rejeita perfil clt", async () => {
    const token = await registerAndLogin("sal-consig-clt@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "clt" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "BMG", amount: 300, consignacao_type: "loan" });

    expectErrorResponseWithRequestId(
      res,
      422,
      "Consignações só podem ser usadas com profile_type 'inss_beneficiary'.",
    );
  });

  it("POST /salary/consignacoes cria consignação e retorna shape correto", async () => {
    const token = await registerAndLogin("sal-consig-create@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "BMG Empréstimo", amount: 456.78, consignacao_type: "loan" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description:     "BMG Empréstimo",
      amount:          456.78,
      consignacaoType: "loan",
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("GET /salary/profile inclui consignações no cálculo", async () => {
    const token = await registerAndLogin("sal-consig-calc@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Empréstimo", amount: 500, consignacao_type: "loan" });

    const res = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.consignacoes).toHaveLength(1);
    expect(res.body.calculation.consignacoesMonthly).toBe(500);
    expect(res.body.calculation.loanTotal).toBe(500);
  });

  it("POST /salary/consignacoes valida description vazia", async () => {
    const token = await registerAndLogin("sal-consig-valdesc@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "", amount: 100, consignacao_type: "loan" });

    expect(res.status).toBe(422);
  });

  it("POST /salary/consignacoes valida description longa", async () => {
    const token = await registerAndLogin("sal-consig-vallong@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A".repeat(101),
        amount: 100,
        consignacao_type: "loan",
      });

    expectErrorResponseWithRequestId(
      res,
      422,
      "description deve ter no máximo 100 caracteres.",
    );
  });

  it("POST /salary/consignacoes valida amount negativo", async () => {
    const token = await registerAndLogin("sal-consig-valamt@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Test", amount: -50, consignacao_type: "loan" });

    expect(res.status).toBe(422);
  });

  it("POST /salary/consignacoes valida tipo inválido", async () => {
    const token = await registerAndLogin("sal-consig-valtype@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Test", amount: 100, consignacao_type: "rubrica_invalida" });

    expect(res.status).toBe(422);
  });

  // ─── Consignações — DELETE ────────────────────────────────────────────────

  it("DELETE /salary/consignacoes/:id bloqueia sem token", async () => {
    const res = await request(app).delete("/salary/consignacoes/1");
    expect(res.status).toBe(401);
  });

  it("DELETE /salary/consignacoes/:id remove consignação existente", async () => {
    const token = await registerAndLogin("sal-consig-delete@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const created = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "Teste", amount: 200, consignacao_type: "card" });

    const consigId = created.body.id;

    const res = await request(app)
      .delete(`/salary/consignacoes/${consigId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Confirm removed from GET profile
    const profile = await request(app)
      .get("/salary/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(profile.body.consignacoes).toHaveLength(0);
  });

  it("DELETE /salary/consignacoes/:id retorna 404 para id inexistente", async () => {
    const token = await registerAndLogin("sal-consig-del404@test.dev");
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .delete("/salary/consignacoes/99999")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(res, 404, "Consignação não encontrada.");
  });

  it("DELETE não permite remover consignação de outro usuário", async () => {
    const tokenA = await registerAndLogin("sal-consig-own-a@test.dev");
    const tokenB = await registerAndLogin("sal-consig-own-b@test.dev");

    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ gross_salary: 4000, profile_type: "inss_beneficiary" });

    const created = await request(app)
      .post("/salary/consignacoes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ description: "Empréstimo A", amount: 300, consignacao_type: "loan" });

    const consigId = created.body.id;

    // User B tries to delete User A's consignação (B has no profile → 404)
    await request(app)
      .put("/salary/profile")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ gross_salary: 5000, profile_type: "inss_beneficiary" });

    const res = await request(app)
      .delete(`/salary/consignacoes/${consigId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
