import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  createTransactionsForUser,
  expectErrorResponseWithRequestId,
  makeProUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("transactions", () => {
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
    await dbQuery("DELETE FROM user_forecasts");
    await dbQuery("DELETE FROM bank_accounts");
    await dbQuery("DELETE FROM user_profiles");
    await dbQuery("DELETE FROM income_statement_deductions");
    await dbQuery("DELETE FROM income_statements");
    await dbQuery("DELETE FROM income_deductions");
    await dbQuery("DELETE FROM income_sources");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /transactions bloqueia sem token", async () => {
    const response = await request(app).get("/transactions");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/summary nao inclui extrato draft como renda confirmada", async () => {
    const token = await registerAndLogin("summary-draft-nao-conta@controlfinance.dev");

    const sourceResponse = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });

    const draftResponse = await request(app)
      .post(`/income-sources/${sourceResponse.body.id}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 2803.52,
        paymentDate: "2026-03-07",
      });

    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.statement.status).toBe("draft");

    const summaryResponse = await request(app)
      .get("/transactions/summary")
      .query({ month: "2026-03" })
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({
      month: "2026-03",
      income: 0,
      expense: 0,
      balance: 0,
    });
  });

  it("GET /transactions/summary inclui extrato posted como renda confirmada", async () => {
    const token = await registerAndLogin("summary-posted-conta@controlfinance.dev");

    const sourceResponse = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });

    const draftResponse = await request(app)
      .post(`/income-sources/${sourceResponse.body.id}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 3150,
        paymentDate: "2026-03-07",
      });

    const postResponse = await request(app)
      .post(`/income-sources/statements/${draftResponse.body.statement.id}/post`)
      .set("Authorization", `Bearer ${token}`);

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.statement.status).toBe("posted");

    const summaryResponse = await request(app)
      .get("/transactions/summary")
      .query({ month: "2026-03" })
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({
      month: "2026-03",
      income: 3150,
      expense: 0,
      balance: 3150,
    });
  });

  it("GET /transactions/summary nao duplica renda ao vincular extrato em transacao existente", async () => {
    const token = await registerAndLogin("summary-link-sem-duplicar@controlfinance.dev");

    const sourceResponse = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pensao INSS" });

    const transactionResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 2800,
        date: "2026-03-07",
        description: "Credito INSS importado",
      });

    const draftResponse = await request(app)
      .post(`/income-sources/${sourceResponse.body.id}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 2800,
        paymentDate: "2026-03-07",
      });

    const linkResponse = await request(app)
      .post(`/income-sources/statements/${draftResponse.body.statement.id}/link-transaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionId: transactionResponse.body.id });

    expect(linkResponse.status).toBe(200);
    expect(linkResponse.body.statement.status).toBe("posted");

    const summaryResponse = await request(app)
      .get("/transactions/summary")
      .query({ month: "2026-03" })
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({
      month: "2026-03",
      income: 2800,
      expense: 0,
      balance: 2800,
    });
  });

  it("cria e lista transacoes do usuario autenticado", async () => {
    const token = await registerAndLogin("transacoes@controlfinance.dev");

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100.5,
        date: "2026-02-13",
        description: "Freelance",
        notes: "Projeto mensal",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
      description: "Freelance",
      notes: "Projeto mensal",
    });
    expect(createResponse.body.categoryId).toBeNull();
    expect(Number.isInteger(createResponse.body.id)).toBe(true);
    expect(Number.isInteger(createResponse.body.userId)).toBe(true);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
      description: "Freelance",
      notes: "Projeto mensal",
    });
    expect(listResponse.body.data[0].categoryId).toBeNull();
    expect(listResponse.body.data[0].id).toBe(createResponse.body.id);
    expect(listResponse.body.data[0].userId).toBe(createResponse.body.userId);
  });

  it("cria transacao com category_id valida do proprio usuario", async () => {
    const token = await registerAndLogin("transacoes-categoria@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lazer",
      });

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 75.9,
        date: "2026-02-15",
        description: "Cinema",
        category_id: categoryResponse.body.id,
      });

    expect(categoryResponse.status).toBe(201);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      type: "Saida",
      value: 75.9,
      categoryId: categoryResponse.body.id,
      description: "Cinema",
    });
  });

  it("bloqueia criacao de transacao com category_id removida por soft delete", async () => {
    const token = await registerAndLogin("transacoes-categoria-removida@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Assinaturas",
      });

    const deleteCategoryResponse = await request(app)
      .delete(`/categories/${categoryResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 45,
        date: "2026-02-16",
        description: "Streaming",
        category_id: categoryResponse.body.id,
      });

    expect(categoryResponse.status).toBe(201);
    expect(deleteCategoryResponse.status).toBe(200);
    expectErrorResponseWithRequestId(createResponse, 404, "Categoria nao encontrada.");
  });

  it("bloqueia criacao de transacao com category_id invalido", async () => {
    const token = await registerAndLogin("transacoes-categoria-invalida@controlfinance.dev");

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
        category_id: "abc",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Categoria invalida. Informe um inteiro maior que zero.",
    );
  });

  it("retorna 404 quando category_id nao pertence ao usuario autenticado", async () => {
    const tokenUserA = await registerAndLogin("category-owner@controlfinance.dev");
    const tokenUserB = await registerAndLogin("category-guest@controlfinance.dev");

    const categoryUserAResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Transporte",
      });

    const createByOtherUserResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        type: "Saida",
        value: 30,
        category_id: categoryUserAResponse.body.id,
      });

    const createWithUnknownCategoryResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        type: "Saida",
        value: 30,
        category_id: 999999,
      });

    expect(categoryUserAResponse.status).toBe(201);
    expectErrorResponseWithRequestId(createByOtherUserResponse, 404, "Categoria nao encontrada.");
    expectErrorResponseWithRequestId(
      createWithUnknownCategoryResponse,
      404,
      "Categoria nao encontrada.",
    );
  });

  it("pagina transacoes com meta consistente", async () => {
    const token = await registerAndLogin("pagination@controlfinance.dev");

    await Promise.all(
      [1, 2, 3, 4, 5].map((day) =>
        request(app)
          .post("/transactions")
          .set("Authorization", `Bearer ${token}`)
          .send({
            type: "Entrada",
            value: day * 10,
            date: `2026-02-0${day}`,
            description: `Lancamento ${day}`,
          }),
      ),
    );

    const secondPageResponse = await request(app)
      .get("/transactions")
      .query({
        page: 2,
        limit: 2,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.meta).toEqual({
      page: 2,
      limit: 2,
      offset: 2,
      total: 5,
      totalPages: 3,
    });
    expect(secondPageResponse.body.data).toHaveLength(2);
    expect(secondPageResponse.body.data[0].description).toBe("Lancamento 3");
    expect(secondPageResponse.body.data[1].description).toBe("Lancamento 4");
  });

  it("aplica limit=20 e offset=0 por padrao em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-default@controlfinance.dev");
    await createTransactionsForUser(token, 25);

    const response = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 25,
      totalPages: 2,
    });
    expect(response.body.data).toHaveLength(20);
    expect(response.body.data[0].description).toBe("Lancamento 1");
    expect(response.body.data[19].description).toBe("Lancamento 20");
  });

  it("aplica offset=0 quando limit e explicito em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-limit@controlfinance.dev");
    await createTransactionsForUser(token, 25);

    const response = await request(app)
      .get("/transactions")
      .query({
        limit: 10,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 10,
      offset: 0,
      total: 25,
      totalPages: 3,
    });
    expect(response.body.data).toHaveLength(10);
    expect(response.body.data[0].description).toBe("Lancamento 1");
    expect(response.body.data[9].description).toBe("Lancamento 10");
  });

  it("aplica precedencia de offset sobre page em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-offset-precedence@controlfinance.dev");
    await createTransactionsForUser(token, 5);

    const response = await request(app)
      .get("/transactions")
      .query({
        page: 3,
        limit: 2,
        offset: 1,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      offset: 1,
      total: 5,
      totalPages: 3,
    });
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].description).toBe("Lancamento 2");
    expect(response.body.data[1].description).toBe("Lancamento 3");
  });

  it("ordena transacoes por amount desc quando sort=amount:desc", async () => {
    const token = await registerAndLogin("pagination-sort-amount-desc@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 20,
        date: "2026-02-01",
        description: "Valor 20",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 70,
        date: "2026-02-02",
        description: "Valor 70",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 45,
        date: "2026-02-03",
        description: "Valor 45",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "amount:desc",
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((transaction) => Number(transaction.value))).toEqual([70, 45, 20]);
  });

  it("aceita direcao case-insensitive em sort e ordena corretamente", async () => {
    const token = await registerAndLogin("pagination-sort-direction-case@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 10,
        date: "2026-02-01",
        description: "Valor 10",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 30,
        date: "2026-02-02",
        description: "Valor 30",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "amount:DESC",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((transaction) => Number(transaction.value))).toEqual([30, 10]);
  });

  it("faz fallback para ordenacao padrao quando sort e invalido", async () => {
    const token = await registerAndLogin("pagination-sort-fallback@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 10,
        date: "2026-02-03",
        description: "Terceiro",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 20,
        date: "2026-02-01",
        description: "Primeiro",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 15,
        date: "2026-02-02",
        description: "Segundo",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "hacker:desc",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((transaction) => transaction.description)).toEqual([
      "Primeiro",
      "Segundo",
      "Terceiro",
    ]);
  });

  it.each([
    { limit: "101" },
    { offset: "-1" },
    { limit: "10.5" },
    { offset: "abc" },
  ])("retorna 400 para paginacao invalida em GET /transactions (%o)", async (query) => {
    const token = await registerAndLogin(
      `pagination-invalid-${Object.keys(query)[0]}-${String(Object.values(query)[0])}@controlfinance.dev`,
    );

    const response = await request(app)
      .get("/transactions")
      .query(query)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Paginacao invalida.");
  });

  it("filtra transacoes por categoryId", async () => {
    const token = await registerAndLogin("filtro-categoria@controlfinance.dev");

    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const transportCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 45,
        date: "2026-02-10",
        description: "Mercado",
        category_id: foodCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
        date: "2026-02-11",
        description: "Onibus",
        category_id: transportCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-12",
        description: "Freela",
      });

    const filteredResponse = await request(app)
      .get("/transactions")
      .query({
        categoryId: foodCategoryResponse.body.id,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(foodCategoryResponse.status).toBe(201);
    expect(transportCategoryResponse.status).toBe(201);
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0]).toMatchObject({
      description: "Mercado",
      categoryId: foodCategoryResponse.body.id,
    });
  });

  it("retorna 400 para filtro categoryId invalido", async () => {
    const token = await registerAndLogin("filtro-categoria-invalido@controlfinance.dev");

    const response = await request(app)
      .get("/transactions")
      .query({
        categoryId: "abc",
      })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(
      response,
      400,
      "Categoria invalida. Informe um inteiro maior que zero.",
    );
  });

  it("filtra transacoes por tipo, periodo e busca", async () => {
    const token = await registerAndLogin("filtro@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-01",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 30,
        date: "2026-02-11",
        description: "Mercado central",
        notes: "Compra semanal",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 25,
        date: "2026-02-20",
        description: "Transporte",
      });

    const filteredResponse = await request(app)
      .get("/transactions")
      .query({
        type: "Saida",
        from: "2026-02-01",
        to: "2026-02-15",
        q: "merc",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0]).toMatchObject({
      type: "Saida",
      value: 30,
      date: "2026-02-11",
      description: "Mercado central",
    });
  });

  it("exporta CSV filtrado com totais", async () => {
    const token = await registerAndLogin("export@controlfinance.dev");
    await makeProUser("export@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-10",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 40,
        date: "2026-02-12",
        description: "Mercado, feira",
        notes: 'Compra "A"',
      });

    const exportResponse = await request(app)
      .get("/transactions/export.csv")
      .query({
        type: "Saida",
        from: "2026-02-01",
        to: "2026-02-28",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain(
      'attachment; filename="transacoes-saida-2026-02-01-a-2026-02-28.csv"',
    );
    expect(exportResponse.text).toContain(
      "id,type,value,date,description,notes,category_name,created_at",
    );
    expect(exportResponse.text).toContain("Sem categoria");
    expect(exportResponse.text).toContain('"Mercado, feira"');
    expect(exportResponse.text).toContain('"Compra ""A"""');
    expect(exportResponse.text).toContain("summary,total_entradas,total_saidas,saldo");
    expect(exportResponse.text).toContain("totals,0.00,40.00,-40.00");
    expect(exportResponse.text).not.toContain("Salario");
  });

  it("exporta CSV incluindo category_name quando a transacao possui categoria", async () => {
    const token = await registerAndLogin("export-category@controlfinance.dev");
    await makeProUser("export-category@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Supermercado",
      });

    expect(categoryResponse.status).toBe(201);

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 80,
        date: "2026-02-20",
        description: "Compra mensal",
        category_id: categoryResponse.body.id,
      });

    const exportResponse = await request(app)
      .get("/transactions/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.text).toContain(
      "id,type,value,date,description,notes,category_name,created_at",
    );
    expect(exportResponse.text).toContain("Supermercado");
  });

  it("atualiza transacao do proprio usuario", async () => {
    const token = await registerAndLogin("update@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 200,
        date: "2026-02-14",
        description: "Salario",
      });

    const updatedTransaction = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 180.4,
        description: "Mercado",
        notes: "Compra quinzenal",
      });

    expect(updatedTransaction.status).toBe(200);
    expect(updatedTransaction.body).toMatchObject({
      id: createdTransaction.body.id,
      type: "Saida",
      value: 180.4,
      date: "2026-02-14",
      description: "Mercado",
      notes: "Compra quinzenal",
    });
  });

  it("atualiza transacao para Sem categoria quando category_id = null", async () => {
    const token = await registerAndLogin("update-category-null@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lazer",
      });

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 90,
        date: "2026-02-14",
        description: "Cinema",
        category_id: categoryResponse.body.id,
      });

    const updatedTransaction = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        category_id: null,
      });

    expect(categoryResponse.status).toBe(201);
    expect(createdTransaction.status).toBe(201);
    expect(updatedTransaction.status).toBe(200);
    expect(updatedTransaction.body).toMatchObject({
      id: createdTransaction.body.id,
      categoryId: null,
      type: "Saida",
      value: 90,
      date: "2026-02-14",
      description: "Cinema",
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: createdTransaction.body.id,
      categoryId: null,
    });
  });

  it("bloqueia atualizacao de transacao para category_id removida", async () => {
    const token = await registerAndLogin("update-category-deleted@controlfinance.dev");

    const sourceCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deletedCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Assinaturas",
      });

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 55,
        date: "2026-02-14",
        description: "Compra",
        category_id: sourceCategoryResponse.body.id,
      });

    const deleteCategoryResponse = await request(app)
      .delete(`/categories/${deletedCategoryResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const updateResponse = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        category_id: deletedCategoryResponse.body.id,
      });

    expect(sourceCategoryResponse.status).toBe(201);
    expect(deletedCategoryResponse.status).toBe(201);
    expect(createdTransaction.status).toBe(201);
    expect(deleteCategoryResponse.status).toBe(200);
    expectErrorResponseWithRequestId(updateResponse, 404, "Categoria nao encontrada.");
  });

  it("nao permite atualizar transacao de outro usuario", async () => {
    const tokenUserA = await registerAndLogin("owner-update@controlfinance.dev");
    const tokenUserB = await registerAndLogin("guest-update@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 80,
      });

    const updateResponse = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        value: 99,
      });

    expect(updateResponse.status).toBe(404);
  });

  it("isola transacoes por usuario", async () => {
    const tokenUserA = await registerAndLogin("usuario-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("usuario-b@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 80,
      });

    const listUserB = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(listUserB.status).toBe(200);
    expect(listUserB.body.data).toEqual([]);
    expect(listUserB.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 0,
      totalPages: 1,
    });
  });

  it("nao permite deletar transacao de outro usuario", async () => {
    const tokenUserA = await registerAndLogin("dono@controlfinance.dev");
    const tokenUserB = await registerAndLogin("visitante@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 15,
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(deleteResponse.status).toBe(404);
  });

  it("deleta transacao do proprio usuario", async () => {
    const token = await registerAndLogin("delete@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      id: createdTransaction.body.id,
      success: true,
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([]);
  });

  it("restaura transacao removida por soft delete", async () => {
    const token = await registerAndLogin("restore@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        description: "Internet",
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);

    const listWithoutDeleted = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listWithoutDeleted.status).toBe(200);
    expect(listWithoutDeleted.body.data).toEqual([]);

    const listWithDeleted = await request(app)
      .get("/transactions?includeDeleted=true")
      .set("Authorization", `Bearer ${token}`);

    expect(listWithDeleted.status).toBe(200);
    expect(listWithDeleted.body.data).toHaveLength(1);
    expect(listWithDeleted.body.data[0].deletedAt).toBeTruthy();

    const restoreResponse = await request(app)
      .post(`/transactions/${createdTransaction.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.deletedAt).toBeNull();

    const listAfterRestore = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listAfterRestore.status).toBe(200);
    expect(listAfterRestore.body.data).toHaveLength(1);
    expect(listAfterRestore.body.data[0].id).toBe(createdTransaction.body.id);
  });
});
