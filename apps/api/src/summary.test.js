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
import { expectErrorResponseWithRequestId, registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("transaction summary", () => {
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
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /transactions/summary bloqueia sem token", async () => {
    const response = await request(app).get("/transactions/summary");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/summary retorna 400 quando month nao e informado", async () => {
    const token = await registerAndLogin("summary-sem-mes@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Mes e obrigatorio. Use YYYY-MM.");
  });

  it("GET /transactions/summary retorna 400 quando month e invalido", async () => {
    const token = await registerAndLogin("summary-mes-invalido@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-13",
      })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Mes invalido. Use YYYY-MM.");
  });

  it("GET /transactions/summary retorna 400 quando compare e invalido", async () => {
    const token = await registerAndLogin("summary-compare-invalido@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
        compare: "next",
      })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Compare invalido. Use compare=prev.");
  });

  it("GET /transactions/summary retorna totais zerados quando nao ha transacoes no mes", async () => {
    const token = await registerAndLogin("summary-vazio@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-02",
      income: 0,
      expense: 0,
      balance: 0,
      byCategory: [],
    });
  });

  it("GET /transactions/summary ignora pendencias de contas e considera apenas transacoes realizadas", async () => {
    const token = await registerAndLogin("summary-realizado-only@controlfinance.dev");

    await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Conta de Internet",
        amount: 180,
        dueDate: "2026-02-12",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 1200,
        date: "2026-02-05",
        description: "Receita liquidada",
      });

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-02",
      income: 1200,
      expense: 0,
      balance: 1200,
      byCategory: [],
    });
  });

  it("GET /transactions/summary retorna totais do mes e breakdown por categoria", async () => {
    const token = await registerAndLogin("summary-mix@controlfinance.dev");

    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });
    const foodCategoryId = foodCategoryResponse.body.id;

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 1000,
        date: "2026-02-05",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 220.5,
        date: "2026-02-08",
        description: "Mercado",
        category_id: foodCategoryId,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 80,
        date: "2026-02-09",
        description: "Lanche",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 300,
        date: "2026-03-01",
        description: "Fora do mes",
        category_id: foodCategoryId,
      });

    const deletedExpenseResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        date: "2026-02-10",
        description: "Despesa removida",
        category_id: foodCategoryId,
      });

    await request(app)
      .delete(`/transactions/${deletedExpenseResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-02",
      income: 1000,
      expense: 300.5,
      balance: 699.5,
      byCategory: [
        {
          categoryId: foodCategoryId,
          categoryName: "Alimentacao",
          expense: 220.5,
        },
        {
          categoryId: null,
          categoryName: "Sem categoria",
          expense: 80,
        },
      ],
    });
  });

  it("GET /transactions/summary ordena categorias por gasto e mantém Sem categoria no final", async () => {
    const token = await registerAndLogin("summary-ordem-categoria@controlfinance.dev");

    const housingCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Moradia",
      });
    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 500,
        date: "2026-02-02",
        description: "Sem categoria",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 320,
        date: "2026-02-03",
        description: "Aluguel",
        category_id: housingCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 180,
        date: "2026-02-04",
        description: "Mercado",
        category_id: foodCategoryResponse.body.id,
      });

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.byCategory).toEqual([
      {
        categoryId: housingCategoryResponse.body.id,
        categoryName: "Moradia",
        expense: 320,
      },
      {
        categoryId: foodCategoryResponse.body.id,
        categoryName: "Alimentacao",
        expense: 180,
      },
      {
        categoryId: null,
        categoryName: "Sem categoria",
        expense: 500,
      },
    ]);
  });

  it("GET /transactions/summary com compare=prev retorna comparativo mensal e delta por categoria", async () => {
    const token = await registerAndLogin("summary-compare-prev@controlfinance.dev");

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
        type: "Entrada",
        value: 2000,
        date: "2026-01-05",
        description: "Salario Jan",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 500,
        date: "2026-01-08",
        description: "Mercado Jan",
        category_id: foodCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 100,
        date: "2026-01-10",
        description: "Transporte Jan",
        category_id: transportCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        date: "2026-01-15",
        description: "Sem categoria Jan",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 2500,
        date: "2026-02-05",
        description: "Salario Fev",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 700,
        date: "2026-02-08",
        description: "Mercado Fev",
        category_id: foodCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 30,
        date: "2026-02-10",
        description: "Sem categoria Fev",
      });

    const deletedExpenseResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 1000,
        date: "2026-02-11",
        description: "Despesa removida",
        category_id: foodCategoryResponse.body.id,
      });

    await request(app)
      .delete(`/transactions/${deletedExpenseResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
        compare: "prev",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.current).toEqual({
      income: 2500,
      expense: 730,
      balance: 1770,
    });
    expect(response.body.previous).toEqual({
      income: 2000,
      expense: 650,
      balance: 1350,
    });
    expect(response.body.delta).toEqual({
      income: 500,
      expense: 80,
      balance: 420,
      incomePct: 25,
      expensePct: 12.31,
      balancePct: 31.11,
    });
    expect(response.body.byCategoryDelta).toEqual([
      {
        categoryId: foodCategoryResponse.body.id,
        category: "Alimentacao",
        current: 700,
        previous: 500,
        delta: 200,
        deltaPct: 40,
      },
      {
        categoryId: transportCategoryResponse.body.id,
        category: "Transporte",
        current: 0,
        previous: 100,
        delta: -100,
        deltaPct: -100,
      },
      {
        categoryId: null,
        category: "Sem categoria",
        current: 30,
        previous: 50,
        delta: -20,
        deltaPct: -40,
      },
    ]);
  });
});
