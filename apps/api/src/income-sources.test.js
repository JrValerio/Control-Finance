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

describe("income-sources", () => {
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
    await dbQuery("DELETE FROM income_statement_deductions");
    await dbQuery("DELETE FROM income_statements");
    await dbQuery("DELETE FROM income_deductions");
    await dbQuery("DELETE FROM income_sources");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM categories");
    await dbQuery("DELETE FROM users");
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────────

  it("GET /income-sources bloqueia sem token", async () => {
    const res = await request(app).get("/income-sources");
    expect(res.status).toBe(401);
  });

  // ─── Create source ────────────────────────────────────────────────────────────

  it("POST /income-sources cria fonte de renda com nome", async () => {
    const token = await registerAndLogin("inss-create@test.dev");

    const res = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Pensao INSS",
      categoryId: null,
      defaultDay: null,
      notes: null,
    });
    expect(Number.isInteger(res.body.id)).toBe(true);
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("POST /income-sources cria com campos opcionais", async () => {
    const token = await registerAndLogin("inss-create-full@test.dev");

    const catRes = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Rendimentos" });
    const categoryId = catRes.body.id;

    const res = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Salario", categoryId, defaultDay: 5, notes: "CLT" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Salario", categoryId, defaultDay: 5, notes: "CLT" });
  });

  it("POST /income-sources retorna 400 quando nome esta vazio", async () => {
    const token = await registerAndLogin("inss-val-name@test.dev");

    const res = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "   " });

    expectErrorResponseWithRequestId(res, 400, "Nome da fonte de renda e obrigatorio.");
  });

  // ─── List sources ─────────────────────────────────────────────────────────────

  it("GET /income-sources retorna lista com descontos ativos", async () => {
    const token = await registerAndLogin("inss-list@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Emprestimo", amount: 300 });

    const res = await request(app)
      .get("/income-sources")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].name).toBe("Pensao");
    expect(Array.isArray(res.body.sources[0].deductions)).toBe(true);
    expect(res.body.sources[0].deductions).toHaveLength(1);
    expect(res.body.sources[0].deductions[0].label).toBe("Emprestimo");
  });

  it("GET /income-sources retorna lista vazia quando nao ha fontes", async () => {
    const token = await registerAndLogin("inss-list-empty@test.dev");

    const res = await request(app)
      .get("/income-sources")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(0);
  });

  it("GET /income-sources isola fontes entre usuarios", async () => {
    const token1 = await registerAndLogin("inss-iso-1@test.dev");
    const token2 = await registerAndLogin("inss-iso-2@test.dev");

    await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token1}`)
      .send({ name: "Fonte user1" });

    const res = await request(app)
      .get("/income-sources")
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(0);
  });

  // ─── Update source ────────────────────────────────────────────────────────────

  it("PATCH /income-sources/:id atualiza nome", async () => {
    const token = await registerAndLogin("inss-upd@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Original" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .patch(`/income-sources/${sourceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Atualizada" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: sourceId, name: "Atualizada" });
  });

  it("PATCH /income-sources/:id retorna 404 para fonte de outro usuario", async () => {
    const token1 = await registerAndLogin("inss-upd-iso-1@test.dev");
    const token2 = await registerAndLogin("inss-upd-iso-2@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token1}`)
      .send({ name: "Alheia" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .patch(`/income-sources/${sourceId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ name: "Hackeado" });

    expect(res.status).toBe(404);
  });

  // ─── Delete source ────────────────────────────────────────────────────────────

  it("DELETE /income-sources/:id remove a fonte", async () => {
    const token = await registerAndLogin("inss-del@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Remover" });
    const sourceId = srcRes.body.id;

    const deleteRes = await request(app)
      .delete(`/income-sources/${sourceId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/income-sources")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.body.sources).toHaveLength(0);
  });

  it("DELETE /income-sources/:id retorna 404 para fonte de outro usuario", async () => {
    const token1 = await registerAndLogin("inss-del-iso-1@test.dev");
    const token2 = await registerAndLogin("inss-del-iso-2@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token1}`)
      .send({ name: "Alheia" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .delete(`/income-sources/${sourceId}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  // ─── Deductions ────────────────────────────────────────────────────────────────

  it("POST /income-sources/:id/deductions adiciona desconto fixo", async () => {
    const token = await registerAndLogin("inss-ded-fixed@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Emprestimo Caixa", amount: 450.32 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      label: "Emprestimo Caixa",
      amount: 450.32,
      isVariable: false,
      isActive: true,
    });
    expect(Number.isInteger(res.body.id)).toBe(true);
  });

  it("POST /income-sources/:id/deductions adiciona desconto variavel", async () => {
    const token = await registerAndLogin("inss-ded-var@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Cartao Consignado", amount: 200, isVariable: true });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: "Cartao Consignado", isVariable: true });
  });

  it("POST /income-sources/:id/deductions retorna 400 para valor negativo", async () => {
    const token = await registerAndLogin("inss-ded-neg@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Invalido", amount: -50 });

    expectErrorResponseWithRequestId(res, 400, "Valor do desconto deve ser maior ou igual a zero.");
  });

  it("PATCH /income-sources/deductions/:id atualiza valor", async () => {
    const token = await registerAndLogin("inss-ded-upd@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const dedRes = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Emprestimo", amount: 300 });
    const deductionId = dedRes.body.id;

    const res = await request(app)
      .patch(`/income-sources/deductions/${deductionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 350 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: deductionId, amount: 350 });
  });

  it("PATCH /income-sources/deductions/:id retorna 404 para desconto de outro usuario", async () => {
    const token1 = await registerAndLogin("inss-ded-upd-iso-1@test.dev");
    const token2 = await registerAndLogin("inss-ded-upd-iso-2@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token1}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const dedRes = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token1}`)
      .send({ label: "Emprestimo", amount: 300 });
    const deductionId = dedRes.body.id;

    const res = await request(app)
      .patch(`/income-sources/deductions/${deductionId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ amount: 999 });

    expect(res.status).toBe(404);
  });

  it("DELETE /income-sources/deductions/:id remove desconto", async () => {
    const token = await registerAndLogin("inss-ded-del@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const dedRes = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Remover", amount: 100 });
    const deductionId = dedRes.body.id;

    const delRes = await request(app)
      .delete(`/income-sources/deductions/${deductionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    const listRes = await request(app)
      .get("/income-sources")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.body.sources[0].deductions).toHaveLength(0);
  });

  it("DELETE /income-sources/deductions/:id retorna 404 para desconto de outro usuario", async () => {
    const token1 = await registerAndLogin("inss-ded-del-iso-1@test.dev");
    const token2 = await registerAndLogin("inss-ded-del-iso-2@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token1}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const dedRes = await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token1}`)
      .send({ label: "Alheia", amount: 100 });
    const deductionId = dedRes.body.id;

    const res = await request(app)
      .delete(`/income-sources/deductions/${deductionId}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  // ─── Statements ───────────────────────────────────────────────────────────────

  it("POST /income-sources/:id/statements cria rascunho e clona descontos", async () => {
    const token = await registerAndLogin("inss-stmt-create@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Emprestimo 1", amount: 300 });
    await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Cartao", amount: 200, isVariable: true });

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2803.52 });

    expect(res.status).toBe(201);
    expect(res.body.statement).toMatchObject({
      referenceMonth: "2026-02",
      netAmount: 2803.52,
      totalDeductions: 500,
      status: "draft",
    });
    expect(Array.isArray(res.body.deductions)).toBe(true);
    expect(res.body.deductions).toHaveLength(2);
    expect(res.body.deductions[0].label).toBe("Emprestimo 1");
    expect(res.body.deductions[1].label).toBe("Cartao");
  });

  it("POST /income-sources/:id/statements usa descontos explicitos da competencia importada", async () => {
    const token = await registerAndLogin("inss-stmt-imported-deductions@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/deductions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Desconto padrao da fonte", amount: 999 });

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 2803.52,
        grossAmount: 4958.67,
        deductions: [
          { label: "216 CONSIGNACAO EMPRESTIMO BANCARIO", amount: 156 },
          { label: "217 EMPRESTIMO SOBRE A RMC", amount: 238, isVariable: true },
          { label: "268 CONSIGNACAO - CARTAO", amount: 247.93 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.statement).toMatchObject({
      referenceMonth: "2026-03",
      netAmount: 2803.52,
      grossAmount: 4958.67,
      totalDeductions: 641.93,
      status: "draft",
    });
    expect(res.body.deductions).toEqual([
      expect.objectContaining({
        label: "216 CONSIGNACAO EMPRESTIMO BANCARIO",
        amount: 156,
        isVariable: false,
      }),
      expect.objectContaining({
        label: "217 EMPRESTIMO SOBRE A RMC",
        amount: 238,
        isVariable: true,
      }),
      expect.objectContaining({
        label: "268 CONSIGNACAO - CARTAO",
        amount: 247.93,
        isVariable: false,
      }),
    ]);
  });

  it("POST /income-sources/:id/statements retorna 409 para mes duplicado", async () => {
    const token = await registerAndLogin("inss-stmt-dup@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-01", netAmount: 2500 });

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-01", netAmount: 2500 });

    expectErrorResponseWithRequestId(res, 409, "Ja existe um extrato para 2026-01.");
  });

  it("POST /income-sources/:id/statements permite ignorar competência já existente", async () => {
    const token = await registerAndLogin("inss-stmt-ignore@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const first = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-01", netAmount: 2500, paymentDate: "2026-01-25" });

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-01",
        netAmount: 2803.52,
        paymentDate: "2026-01-31",
        existingCompetenceAction: "ignore",
      });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored");
    expect(res.body.statement).toMatchObject({
      id: first.body.statement.id,
      referenceMonth: "2026-01",
      netAmount: 2500,
      paymentDate: "2026-01-25",
    });

    const listRes = await request(app)
      .get(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.statements).toHaveLength(1);
    expect(listRes.body.statements[0].netAmount).toBe(2500);
  });

  it("POST /income-sources/:id/statements substitui competência existente sem duplicar e atualiza transação sintética", async () => {
    const token = await registerAndLogin("inss-stmt-replace@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    const first = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-02",
        netAmount: 2500,
        paymentDate: "2026-03-05",
        grossAmount: 4000,
        deductions: [
          { label: "216 CONSIGNACAO EMPRESTIMO BANCARIO", amount: 100, isVariable: false },
        ],
      });

    const statementId = first.body.statement.id;

    const postRes = await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    expect(postRes.status).toBe(200);

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-02",
        netAmount: 2803.52,
        paymentDate: "2026-03-07",
        grossAmount: 4958.67,
        deductions: [
          { label: "216 CONSIGNACAO EMPRESTIMO BANCARIO", amount: 156, isVariable: false },
          { label: "268 CONSIGNACAO - CARTAO", amount: 247.93, isVariable: false },
        ],
        existingCompetenceAction: "replace",
      });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("replaced");
    expect(res.body.statement).toMatchObject({
      id: statementId,
      referenceMonth: "2026-02",
      netAmount: 2803.52,
      grossAmount: 4958.67,
      totalDeductions: 403.93,
      paymentDate: "2026-03-07",
      status: "posted",
    });
    expect(res.body.deductions).toHaveLength(2);

    const listRes = await request(app)
      .get(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.statements).toHaveLength(1);
    expect(listRes.body.statements[0].id).toBe(statementId);

    const txRes = await dbQuery(
      `SELECT value, date, description
         FROM transactions
        WHERE id = $1`,
      [postRes.body.transaction.id],
    );

    expect(txRes.rows[0]).toMatchObject({
      value: 2803.52,
      description: "Pensao INSS – 2026-02",
    });
    expect(new Date(txRes.rows[0].date).toISOString().slice(0, 10)).toBe("2026-03-07");
  });

  it("POST /income-sources/:id/statements persiste grossAmount e details", async () => {
    const token = await registerAndLogin("inss-stmt-gross@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 2803.52,
        grossAmount: 4958.67,
        details: {
          benefitKind: "pensao_por_morte_previdenciaria",
          deductions: [
            { label: "emprestimo_consignado", amount: 1200 },
            { label: "cartao_rmc", amount: 955.15 },
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.statement).toMatchObject({
      referenceMonth: "2026-03",
      netAmount: 2803.52,
      grossAmount: 4958.67,
    });
    expect(res.body.statement.details).toMatchObject({
      benefitKind: "pensao_por_morte_previdenciaria",
      deductions: [
        { label: "emprestimo_consignado", amount: 1200 },
        { label: "cartao_rmc", amount: 955.15 },
      ],
    });
  });

  it("POST /income-sources/:id/statements retorna grossAmount null quando omitido", async () => {
    const token = await registerAndLogin("inss-stmt-nogross@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Salario" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-03", netAmount: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.statement.grossAmount).toBeNull();
    expect(res.body.statement.details).toBeNull();
  });

  it("POST /income-sources/:id/statements retorna 400 para grossAmount negativo", async () => {
    const token = await registerAndLogin("inss-stmt-negatives@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Salario" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-03", netAmount: 5000, grossAmount: -100 });

    expectErrorResponseWithRequestId(res, 400, "Valor bruto deve ser maior que zero.");
  });

  it("POST /income-sources/:id/statements retorna 400 para details invalido", async () => {
    const token = await registerAndLogin("inss-stmt-baddetails@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Salario" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-03", netAmount: 5000, details: "string invalida" });

    expectErrorResponseWithRequestId(res, 400, "Detalhes deve ser um objeto.");
  });

  it("POST /income-sources/:id/statements retorna 400 para mes invalido", async () => {
    const token = await registerAndLogin("inss-stmt-badmonth@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const res = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-13", netAmount: 2500 });

    expectErrorResponseWithRequestId(res, 400, "Mes de referencia invalido. Use o formato YYYY-MM.");
  });

  it("PATCH /income-sources/statements/:id atualiza valor liquido", async () => {
    const token = await registerAndLogin("inss-stmt-upd@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2500 });
    const statementId = stmtRes.body.statement.id;

    const res = await request(app)
      .patch(`/income-sources/statements/${statementId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ netAmount: 2803.52 });

    expect(res.status).toBe(200);
    expect(res.body.statement).toMatchObject({ id: statementId, netAmount: 2803.52 });
  });

  it("PATCH /income-sources/statements/:id retorna 400 se ja lancado", async () => {
    const token = await registerAndLogin("inss-stmt-upd-posted@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2500 });
    const statementId = stmtRes.body.statement.id;

    await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .patch(`/income-sources/statements/${statementId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ netAmount: 999 });

    expectErrorResponseWithRequestId(res, 400, "Extrato ja lancado. Nao e possivel editar.");
  });

  it("POST /income-sources/statements/:id/post cria transacao Entrada e marca lancado", async () => {
    const token = await registerAndLogin("inss-post@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2803.52 });
    const statementId = stmtRes.body.statement.id;

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statement).toMatchObject({ id: statementId, status: "posted" });
    expect(Number.isInteger(res.body.statement.postedTransactionId)).toBe(true);
    expect(res.body.transaction).toMatchObject({
      type: "Entrada",
      value: 2803.52,
      description: "Pensao INSS – 2026-02",
    });

    // Transaction appears in list
    const txRes = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);
    expect(txRes.body.data.some((tx) => tx.description === "Pensao INSS – 2026-02")).toBe(true);
  });

  it("POST /income-sources/statements/:id/post herda category_id da fonte", async () => {
    const token = await registerAndLogin("inss-post-cat@test.dev");

    const catRes = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Rendimentos" });
    const categoryId = catRes.body.id;

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao", categoryId });
    const sourceId = srcRes.body.id;

    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2500 });
    const statementId = stmtRes.body.statement.id;

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transaction.categoryId).toBe(categoryId);
  });

  it("POST /income-sources/statements/:id/post retorna 409 ao relançar", async () => {
    const token = await registerAndLogin("inss-post-dup@test.dev");

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao" });
    const sourceId = srcRes.body.id;

    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ referenceMonth: "2026-02", netAmount: 2500 });
    const statementId = stmtRes.body.statement.id;

    await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/post`)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(res, 409, "Extrato ja foi lancado.");
  });

  it("GET /income-sources/:id/statements retorna candidato de conciliacao para credito importado compativel", async () => {
    const email = "inss-reconcile-candidate@test.dev";
    const token = await registerAndLogin(email);

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-02",
        netAmount: 1412,
        paymentDate: "2026-02-25",
        sourceImportSessionId: "income-doc-session-1",
      });

    await dbQuery(
      `INSERT INTO transactions (
         user_id, type, value, date, description, import_session_id, import_document_type
       )
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5, $6, $7)`,
      [email, "Entrada", 1412, "2026-02-25", "Credito INSS", "bank-session-1", "bank_statement"],
    );

    const res = await request(app)
      .get(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statements[0]).toMatchObject({
      referenceMonth: "2026-02",
      reconciliation: {
        status: "candidate",
        candidates: [
          expect.objectContaining({
            description: "Credito INSS",
            importSessionId: "bank-session-1",
          }),
        ],
      },
    });
  });

  it("GET /income-sources/:id/statements distingue conciliado de lancamento manual", async () => {
    const email = "inss-reconcile-linked@test.dev";
    const token = await registerAndLogin(email);

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });
    const sourceId = srcRes.body.id;

    const importedStatementRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-02",
        netAmount: 1412,
        paymentDate: "2026-02-25",
      });

    const manualStatementRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 1500,
        paymentDate: "2026-03-25",
      });

    const { rows: importedTxRows } = await dbQuery(
      `INSERT INTO transactions (
         user_id, type, value, date, description, import_session_id, import_document_type
       )
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [email, "Entrada", 1412, "2026-02-25", "Credito INSS", "bank-session-2", "bank_statement"],
    );

    const { rows: manualTxRows } = await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5)
       RETURNING id`,
      [email, "Entrada", 1500, "2026-03-25", "Entrada manual"],
    );

    await request(app)
      .post(`/income-sources/statements/${importedStatementRes.body.statement.id}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: Number(importedTxRows[0].id) });

    await request(app)
      .post(`/income-sources/statements/${manualStatementRes.body.statement.id}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: Number(manualTxRows[0].id) });

    const res = await request(app)
      .get(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceMonth: "2026-02",
          reconciliation: expect.objectContaining({ status: "reconciled" }),
        }),
        expect.objectContaining({
          referenceMonth: "2026-03",
          reconciliation: expect.objectContaining({ status: "manual_entry" }),
        }),
      ]),
    );
  });

  // ─── Link statement to transaction ───────────────────────────────────────────

  const setupStatementAndTransaction = async (email, opts = {}) => {
    const token = await registerAndLogin(email);

    const srcRes = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "INSS Beneficio" });
    const sourceId = srcRes.body.id;

    const netAmount = opts.netAmount ?? 1412.0;
    const stmtRes = await request(app)
      .post(`/income-sources/${sourceId}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: opts.referenceMonth ?? "2026-02",
        netAmount,
        paymentDate: opts.paymentDate ?? "2026-02-25",
      });
    const statementId = stmtRes.body.statement.id;

    // Create matching income transaction directly in DB
    const txDate = opts.txDate ?? "2026-02-25";
    const txValue = opts.txValue ?? netAmount;
    const txType = opts.txType ?? "Entrada";
    const { rows } = await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5)
       RETURNING id`,
      [email, txType, txValue, txDate, "INSS Credito"],
    );
    const transactionId = Number(rows[0].id);

    return { token, statementId, transactionId };
  };

  it("POST /income-sources/statements/:id/link-transaction vincula com sucesso", async () => {
    const { token, statementId, transactionId } = await setupStatementAndTransaction(
      "inss-link-ok@test.dev",
    );

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId });

    expect(res.status).toBe(200);
    expect(res.body.statement).toMatchObject({
      id: statementId,
      postedTransactionId: transactionId,
      status: "posted",
    });
  });

  it("POST .../link-transaction e idempotente ao revincular mesma transacao", async () => {
    const { token, statementId, transactionId } = await setupStatementAndTransaction(
      "inss-link-idem@test.dev",
    );

    await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId });

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId });

    expect(res.status).toBe(200);
    expect(res.body.statement.postedTransactionId).toBe(transactionId);
  });

  it("POST .../link-transaction retorna 404 para extrato de outro usuario", async () => {
    const { statementId } = await setupStatementAndTransaction("inss-link-other-stmt@test.dev");
    const token2 = await registerAndLogin("inss-link-other-user@test.dev");

    // create a transaction for user2
    const { rows } = await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5)
       RETURNING id`,
      ["inss-link-other-user@test.dev", "Entrada", 1412, "2026-02-25", "Outro"],
    );
    const txId = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(404);
  });

  it("POST .../link-transaction retorna 404 para transacao de outro usuario", async () => {
    const { token, statementId } = await setupStatementAndTransaction(
      "inss-link-other-tx@test.dev",
    );

    // create a transaction for a different user
    await registerAndLogin("inss-link-other-tx-owner@test.dev");
    const { rows } = await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5)
       RETURNING id`,
      ["inss-link-other-tx-owner@test.dev", "Entrada", 1412, "2026-02-25", "Outro"],
    );
    const txId = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(404);
  });

  it("POST .../link-transaction retorna 422 para transacao tipo Saida", async () => {
    const { token, statementId } = await setupStatementAndTransaction(
      "inss-link-exit@test.dev",
      { txType: "Saida" },
    );

    const { rows } = await dbQuery(
      `SELECT id FROM transactions WHERE user_id = (SELECT id FROM users WHERE email = $1) LIMIT 1`,
      ["inss-link-exit@test.dev"],
    );
    const txId = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expectErrorResponseWithRequestId(res, 422, "A transacao deve ser do tipo Entrada.");
  });

  it("POST .../link-transaction retorna 422 quando valor difere mais de 5%", async () => {
    const { token, statementId } = await setupStatementAndTransaction(
      "inss-link-amt@test.dev",
      { netAmount: 1000, txValue: 1100 }, // 10% diff
    );

    const { rows } = await dbQuery(
      `SELECT id FROM transactions WHERE user_id = (SELECT id FROM users WHERE email = $1) LIMIT 1`,
      ["inss-link-amt@test.dev"],
    );
    const txId = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(422);
  });

  it("POST .../link-transaction retorna 422 quando data difere mais de 10 dias", async () => {
    const { token, statementId } = await setupStatementAndTransaction(
      "inss-link-date@test.dev",
      { paymentDate: "2026-02-25", txDate: "2026-03-10" }, // 13 days diff
    );

    const { rows } = await dbQuery(
      `SELECT id FROM transactions WHERE user_id = (SELECT id FROM users WHERE email = $1) LIMIT 1`,
      ["inss-link-date@test.dev"],
    );
    const txId = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId });

    expect(res.status).toBe(422);
  });

  it("POST .../link-transaction retorna 409 ao tentar vincular outra transacao em extrato ja vinculado", async () => {
    const { token, statementId, transactionId } = await setupStatementAndTransaction(
      "inss-link-conflict@test.dev",
    );

    await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId });

    // create a second transaction for the same user
    const { rows } = await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description)
       VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4, $5)
       RETURNING id`,
      ["inss-link-conflict@test.dev", "Entrada", 1412, "2026-02-25", "Outro credito"],
    );
    const txId2 = Number(rows[0].id);

    const res = await request(app)
      .post(`/income-sources/statements/${statementId}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: txId2 });

    expectErrorResponseWithRequestId(res, 409, "Extrato ja vinculado a outra transacao.");
  });
});
