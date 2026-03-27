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
  getUserIdByEmail,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("credit cards", () => {
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
    await dbQuery("DELETE FROM credit_card_purchases");
    await dbQuery("DELETE FROM credit_cards");
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM user_profiles");
    await dbQuery("DELETE FROM users");
  });

  it("GET /credit-cards bloqueia sem token", async () => {
    const res = await request(app).get("/credit-cards");
    expect(res.status).toBe(401);
  });

  it("POST /credit-cards cria cartao e GET /credit-cards retorna uso inicial zerado", async () => {
    const token = await registerAndLogin("credit-cards-create@test.dev");

    const createRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nubank",
        limitTotal: 2500,
        closingDay: 10,
        dueDay: 20,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      name: "Nubank",
      limitTotal: 2500,
      closingDay: 10,
      dueDay: 20,
      isActive: true,
    });

    const listRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0]).toMatchObject({
      name: "Nubank",
      openPurchasesCount: 0,
      openPurchasesTotal: 0,
      pendingInvoicesCount: 0,
      pendingInvoicesTotal: 0,
      usage: {
        total: 2500,
        used: 0,
        available: 2500,
        exceededBy: 0,
        usagePct: 0,
        status: "unused",
      },
    });
  });

  it("POST /credit-cards/:id/purchases registra compra sem criar saída imediata em transactions", async () => {
    const email = "credit-cards-purchase@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Inter",
        limitTotal: 1000,
        closingDay: 12,
        dueDay: 22,
      });

    const purchaseRes = await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Farmácia",
        amount: 120.5,
        purchaseDate: "2026-03-05",
      });

    expect(purchaseRes.status).toBe(201);
    expect(purchaseRes.body).toMatchObject({
      title: "Farmácia",
      amount: 120.5,
      purchaseDate: "2026-03-05",
      status: "open",
      billId: null,
      statementMonth: null,
      installmentGroupId: null,
      installmentNumber: null,
      installmentCount: null,
    });

    const listRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items[0]).toMatchObject({
      openPurchasesCount: 1,
      openPurchasesTotal: 120.5,
      pendingInvoicesCount: 0,
      usage: {
        total: 1000,
        used: 120.5,
        available: 879.5,
        status: "using",
      },
    });

    const txCountResult = await dbQuery(
      `SELECT COUNT(*) AS total FROM transactions WHERE user_id = $1`,
      [userId],
    );

    expect(Number(txCountResult.rows[0].total)).toBe(0);
  });

  it("POST /credit-cards/:id/installments cria compra parcelada mensal sem distorcer o uso do limite", async () => {
    const token = await registerAndLogin("credit-cards-installments@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nubank",
        limitTotal: 2000,
        closingDay: 10,
        dueDay: 20,
      });

    const installmentsRes = await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/installments`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Notebook",
        amount: 300,
        purchaseDate: "2026-03-05",
        installmentCount: 3,
      });

    expect(installmentsRes.status).toBe(201);
    expect(installmentsRes.body).toMatchObject({
      installmentCount: 3,
      totalAmount: 300,
    });
    expect(installmentsRes.body.purchases).toHaveLength(3);
    expect(installmentsRes.body.purchases[0]).toMatchObject({
      title: "Notebook",
      amount: 100,
      purchaseDate: "2026-03-05",
      installmentNumber: 1,
      installmentCount: 3,
    });
    expect(installmentsRes.body.purchases[1]).toMatchObject({
      purchaseDate: "2026-04-05",
      installmentNumber: 2,
      installmentCount: 3,
    });
    expect(installmentsRes.body.purchases[2]).toMatchObject({
      purchaseDate: "2026-05-05",
      installmentNumber: 3,
      installmentCount: 3,
    });

    const listRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items[0]).toMatchObject({
      openPurchasesCount: 3,
      openPurchasesTotal: 300,
      usage: {
        total: 2000,
        used: 300,
        available: 1700,
        status: "using",
      },
    });
  });

  it("POST /credit-cards/:id/close-invoice bloqueia fechamento antes do dia configurado", async () => {
    const token = await registerAndLogin("credit-cards-close-early@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Itaucard",
        limitTotal: 2000,
        closingDay: 15,
        dueDay: 25,
      });

    await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Mercado",
        amount: 300,
        purchaseDate: "2026-03-05",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-10" });

    expectErrorResponseWithRequestId(closeRes, 409, "Ainda nao chegou o dia de fechamento deste cartao.");
  });

  it("fechar fatura gera bill pendente e pagar a fatura cria a saída real de caixa", async () => {
    const email = "credit-cards-bill-flow@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "XP Visa",
        limitTotal: 1500,
        closingDay: 10,
        dueDay: 25,
      });
    const cardId = createCardRes.body.id;

    await request(app)
      .post(`/credit-cards/${cardId}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Mercado",
        amount: 320,
        purchaseDate: "2026-03-05",
      });

    await request(app)
      .post(`/credit-cards/${cardId}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Posto",
        amount: 80,
        purchaseDate: "2026-03-07",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${cardId}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body).toMatchObject({
      purchasesCount: 2,
      total: 400,
      invoice: {
        amount: 400,
        status: "pending",
        referenceMonth: "2026-03",
        dueDate: "2026-03-25",
      },
    });

    const invoiceId = Number(closeRes.body.invoice.id);

    const listAfterCloseRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listAfterCloseRes.status).toBe(200);
    expect(listAfterCloseRes.body.items[0]).toMatchObject({
      openPurchasesCount: 0,
      pendingInvoicesCount: 1,
      pendingInvoicesTotal: 400,
      usage: {
        used: 400,
        available: 1100,
        status: "using",
      },
    });

    const payRes = await request(app)
      .patch(`/bills/${invoiceId}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(payRes.status).toBe(200);
    expect(payRes.body.transaction).toMatchObject({
      type: "Saida",
      value: 400,
      description: "Fatura XP Visa 2026-03",
    });

    const listAfterPaymentRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listAfterPaymentRes.status).toBe(200);
    expect(listAfterPaymentRes.body.items[0]).toMatchObject({
      pendingInvoicesCount: 0,
      pendingInvoicesTotal: 0,
      usage: {
        used: 0,
        available: 1500,
        status: "unused",
      },
    });

    const txCountResult = await dbQuery(
      `SELECT COUNT(*) AS total FROM transactions WHERE user_id = $1`,
      [userId],
    );
    expect(Number(txCountResult.rows[0].total)).toBe(1);
  });

  it("POST /credit-cards/invoices/:invoiceId/reopen reabre fatura pendente e devolve compras para aberto", async () => {
    const token = await registerAndLogin("credit-cards-reopen-invoice@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Visa",
        limitTotal: 1800,
        closingDay: 10,
        dueDay: 20,
      });
    const cardId = createCardRes.body.id;

    await request(app)
      .post(`/credit-cards/${cardId}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Mercado",
        amount: 180,
        purchaseDate: "2026-03-05",
      });

    await request(app)
      .post(`/credit-cards/${cardId}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Farmácia",
        amount: 70,
        purchaseDate: "2026-03-08",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${cardId}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    expect(closeRes.status).toBe(200);

    const reopenRes = await request(app)
      .post(`/credit-cards/invoices/${closeRes.body.invoice.id}/reopen`)
      .set("Authorization", `Bearer ${token}`);

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body).toMatchObject({
      invoiceId: closeRes.body.invoice.id,
      reopenedPurchasesCount: 2,
      success: true,
    });

    const listRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items[0]).toMatchObject({
      openPurchasesCount: 2,
      openPurchasesTotal: 250,
      pendingInvoicesCount: 0,
      pendingInvoicesTotal: 0,
      usage: {
        total: 1800,
        used: 250,
        available: 1550,
        status: "using",
      },
    });

    const billedPurchasesResult = await dbQuery(
      `SELECT COUNT(*)::int AS total
         FROM credit_card_purchases
        WHERE credit_card_id = $1
          AND status = 'billed'`,
      [cardId],
    );
    expect(Number(billedPurchasesResult.rows[0].total)).toBe(0);
  });

  it("POST /credit-cards/invoices/:invoiceId/reopen bloqueia reabertura de fatura paga", async () => {
    const token = await registerAndLogin("credit-cards-reopen-paid@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mastercard",
        limitTotal: 1400,
        closingDay: 10,
        dueDay: 20,
      });
    const cardId = createCardRes.body.id;

    await request(app)
      .post(`/credit-cards/${cardId}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Streaming",
        amount: 59.9,
        purchaseDate: "2026-03-05",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${cardId}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    await request(app)
      .patch(`/bills/${closeRes.body.invoice.id}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paidAt: "2026-03-20T10:00:00.000Z" });

    const reopenRes = await request(app)
      .post(`/credit-cards/invoices/${closeRes.body.invoice.id}/reopen`)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(
      reopenRes,
      409,
      "Apenas faturas pendentes podem ser reabertas.",
    );
  });

  it("fecha apenas a parcela elegivel do ciclo e preserva as proximas abertas", async () => {
    const token = await registerAndLogin("credit-cards-installment-cycle@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Visa",
        limitTotal: 1200,
        closingDay: 10,
        dueDay: 20,
      });
    const cardId = createCardRes.body.id;

    await request(app)
      .post(`/credit-cards/${cardId}/installments`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Celular",
        amount: 300,
        purchaseDate: "2026-03-05",
        installmentCount: 3,
      });

    const firstCloseRes = await request(app)
      .post(`/credit-cards/${cardId}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    expect(firstCloseRes.status).toBe(200);
    expect(firstCloseRes.body).toMatchObject({
      purchasesCount: 1,
      total: 100,
      invoice: {
        amount: 100,
        referenceMonth: "2026-03",
      },
    });

    const afterFirstCloseRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(afterFirstCloseRes.body.items[0]).toMatchObject({
      openPurchasesCount: 2,
      openPurchasesTotal: 200,
      pendingInvoicesCount: 1,
      pendingInvoicesTotal: 100,
      usage: {
        used: 300,
        available: 900,
      },
    });
    expect(afterFirstCloseRes.body.items[0].openPurchases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          installmentNumber: 2,
          installmentCount: 3,
          purchaseDate: "2026-04-05",
        }),
        expect.objectContaining({
          installmentNumber: 3,
          installmentCount: 3,
          purchaseDate: "2026-05-05",
        }),
      ]),
    );
  });

  it("DELETE /credit-cards/purchases/:purchaseId bloqueia compra que ja entrou em fatura fechada", async () => {
    const token = await registerAndLogin("credit-cards-delete-billed@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mastercard",
        limitTotal: 900,
        closingDay: 8,
        dueDay: 18,
      });

    const purchaseRes = await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Streaming",
        amount: 39.9,
        purchaseDate: "2026-03-03",
      });

    await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-10" });

    const deleteRes = await request(app)
      .delete(`/credit-cards/purchases/${purchaseRes.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(deleteRes, 409, "Compra ja entrou em fatura fechada e nao pode ser excluida.");
  });

  it("DELETE /credit-cards/purchases/:purchaseId exclui grupo parcelado inteiro enquanto tudo estiver aberto", async () => {
    const token = await registerAndLogin("credit-cards-delete-installments@test.dev");

    const createCardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Inter",
        limitTotal: 900,
        closingDay: 8,
        dueDay: 18,
      });

    const installmentsRes = await request(app)
      .post(`/credit-cards/${createCardRes.body.id}/installments`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Curso",
        amount: 180,
        purchaseDate: "2026-03-03",
        installmentCount: 3,
      });

    const deleteRes = await request(app)
      .delete(`/credit-cards/purchases/${installmentsRes.body.purchases[0].id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/credit-cards")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items[0]).toMatchObject({
      openPurchasesCount: 0,
      openPurchasesTotal: 0,
      usage: {
        used: 0,
        available: 900,
        status: "unused",
      },
    });
  });
});
