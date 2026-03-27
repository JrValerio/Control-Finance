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
  getUserIdByEmail,
} from "./test-helpers.js";

// Use local-time dates with large offsets to match how the service returns dates
const toLocalDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const FUTURE_DATE = toLocalDate(30);   // 30 days from now — never overdue
const PAST_DATE = toLocalDate(-30);    // 30 days ago — always overdue

describe("bills", () => {
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
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM users");
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  it("GET /bills bloqueia sem token", async () => {
    const res = await request(app).get("/bills");
    expect(res.status).toBe(401);
  });

  it("GET /bills/summary bloqueia sem token", async () => {
    const res = await request(app).get("/bills/summary");
    expect(res.status).toBe(401);
  });

  // ─── Create ──────────────────────────────────────────────────────────────────

  it("POST /bills cria pendencia com campos obrigatorios", async () => {
    const token = await registerAndLogin("bills-create@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Conta de Agua", amount: 132.9, dueDate: FUTURE_DATE });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Conta de Agua",
      amount: 132.9,
      dueDate: FUTURE_DATE,
      status: "pending",
      isOverdue: false,
      categoryId: null,
      paidAt: null,
      notes: null,
      provider: null,
      referenceMonth: null,
    });
    expect(Number.isInteger(res.body.id)).toBe(true);
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("POST /bills cria pendencia com todos os campos opcionais", async () => {
    const token = await registerAndLogin("bills-create-full@test.dev");

    const categoryRes = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Moradia" });
    const categoryId = categoryRes.body.id;

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Luz",
        amount: 220.5,
        dueDate: FUTURE_DATE,
        categoryId,
        notes: "Ref fev/2026",
        provider: "ENEL",
        referenceMonth: "2026-02",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Luz",
      amount: 220.5,
      categoryId,
      notes: "Ref fev/2026",
      provider: "ENEL",
      referenceMonth: "2026-02",
    });
  });

  it("POST /bills retorna 400 quando title esta vazio", async () => {
    const token = await registerAndLogin("bills-val-title@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "   ", amount: 100, dueDate: FUTURE_DATE });

    expectErrorResponseWithRequestId(res, 400, "Titulo e obrigatorio.");
  });

  it("POST /bills retorna 400 quando amount e zero", async () => {
    const token = await registerAndLogin("bills-val-amount@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: 0, dueDate: FUTURE_DATE });

    expectErrorResponseWithRequestId(res, 400, "Valor invalido. Informe um numero maior que zero.");
  });

  it("POST /bills retorna 400 quando amount e negativo", async () => {
    const token = await registerAndLogin("bills-val-neg@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: -50, dueDate: FUTURE_DATE });

    expectErrorResponseWithRequestId(res, 400, "Valor invalido. Informe um numero maior que zero.");
  });

  it("POST /bills retorna 400 quando dueDate e invalido", async () => {
    const token = await registerAndLogin("bills-val-date@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: 100, dueDate: "nao-e-uma-data" });

    expectErrorResponseWithRequestId(res, 400, "Data de vencimento invalida. Use YYYY-MM-DD.");
  });

  // ─── List ────────────────────────────────────────────────────────────────────

  it("GET /bills lista pendencias do usuario com paginacao", async () => {
    const token = await registerAndLogin("bills-list@test.dev");

    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: 100, dueDate: FUTURE_DATE });
    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Luz", amount: 200, dueDate: FUTURE_DATE });

    const res = await request(app).get("/bills").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ limit: 20, offset: 0, total: 2 });
  });

  it("GET /bills isola pendencias entre usuarios", async () => {
    const token1 = await registerAndLogin("bills-iso-1@test.dev");
    const token2 = await registerAndLogin("bills-iso-2@test.dev");

    await request(app).post("/bills").set("Authorization", `Bearer ${token1}`)
      .send({ title: "Agua user1", amount: 100, dueDate: FUTURE_DATE });

    const res = await request(app).get("/bills").set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("GET /bills?status=pending retorna apenas pendentes", async () => {
    const token = await registerAndLogin("bills-filter-pending@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Pendente", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    // mark one as paid
    await request(app).patch(`/bills/${billId}/mark-paid`).set("Authorization", `Bearer ${token}`)
      .send({});

    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Outra pendente", amount: 50, dueDate: FUTURE_DATE });

    const res = await request(app).get("/bills?status=pending").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((b) => b.status === "pending")).toBe(true);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /bills?status=paid retorna apenas pagas", async () => {
    const token = await registerAndLogin("bills-filter-paid@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Pagar", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    await request(app).patch(`/bills/${billId}/mark-paid`).set("Authorization", `Bearer ${token}`)
      .send({});

    const res = await request(app).get("/bills?status=paid").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((b) => b.status === "paid")).toBe(true);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /bills?status=overdue retorna pendentes vencidas", async () => {
    const token = await registerAndLogin("bills-overdue@test.dev");
    const userId = await getUserIdByEmail("bills-overdue@test.dev");

    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Vencida", amount: 80, dueDate: FUTURE_DATE });

    // Insert a past-due bill directly to bypass date validation
    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date) VALUES ($1, $2, $3, $4)`,
      [userId, "Atrasada", 150, PAST_DATE],
    );

    const res = await request(app).get("/bills?status=overdue").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("Atrasada");
    expect(res.body.items[0].isOverdue).toBe(true);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────

  it("GET /bills/summary retorna totais corretos", async () => {
    const token = await registerAndLogin("bills-summary@test.dev");
    const userId = await getUserIdByEmail("bills-summary@test.dev");

    await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Normal", amount: 100, dueDate: FUTURE_DATE });

    // Insert overdue directly
    await dbQuery(
      `INSERT INTO bills (user_id, title, amount, due_date) VALUES ($1, $2, $3, $4)`,
      [userId, "Atrasada", 220.1, PAST_DATE],
    );

    const res = await request(app).get("/bills/summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pendingCount: 2,
      pendingTotal: 320.1,
      overdueCount: 1,
      overdueTotal: 220.1,
    });
  });

  it("GET /bills/summary retorna zeros quando nao ha pendencias", async () => {
    const token = await registerAndLogin("bills-summary-empty@test.dev");

    const res = await request(app).get("/bills/summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pendingCount: 0,
      pendingTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
    });
  });

  // ─── Update ──────────────────────────────────────────────────────────────────

  it("PATCH /bills/:id atualiza campos da pendencia", async () => {
    const token = await registerAndLogin("bills-update@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Original", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).patch(`/bills/${billId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Atualizada", amount: 200 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: billId, title: "Atualizada", amount: 200 });
  });

  it("PATCH /bills/:id retorna 404 para bill de outro usuario", async () => {
    const token1 = await registerAndLogin("bills-upd-iso-1@test.dev");
    const token2 = await registerAndLogin("bills-upd-iso-2@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token1}`)
      .send({ title: "User1 bill", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).patch(`/bills/${billId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ title: "Hackeado" });

    expect(res.status).toBe(404);
  });

  it("PATCH /bills/:id retorna 400 quando nenhum campo e enviado", async () => {
    const token = await registerAndLogin("bills-upd-empty@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "X", amount: 10, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).patch(`/bills/${billId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(res, 400, "Nenhum campo para atualizar.");
  });

  // ─── Delete ──────────────────────────────────────────────────────────────────

  it("DELETE /bills/:id remove a pendencia", async () => {
    const token = await registerAndLogin("bills-delete@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Deletar", amount: 50, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const deleteRes = await request(app).delete(`/bills/${billId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app).get("/bills").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.items).toHaveLength(0);
  });

  it("DELETE /bills/:id retorna 404 para bill de outro usuario", async () => {
    const token1 = await registerAndLogin("bills-del-iso-1@test.dev");
    const token2 = await registerAndLogin("bills-del-iso-2@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token1}`)
      .send({ title: "Alheia", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).delete(`/bills/${billId}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  // ─── Mark paid ───────────────────────────────────────────────────────────────

  it("PATCH /bills/:id/mark-paid marca como paga e cria transacao", async () => {
    const token = await registerAndLogin("bills-markpaid@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Agua", amount: 132.9, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).patch(`/bills/${billId}/mark-paid`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.bill).toMatchObject({ id: billId, status: "paid", isOverdue: false });
    expect(typeof res.body.bill.paidAt).toBe("string");

    // Transaction created
    expect(res.body.transaction).toMatchObject({
      type: "Saida",
      value: 132.9,
      description: "Agua",
    });
    expect(Number.isInteger(res.body.transaction.id)).toBe(true);

    // Bill no longer appears in pending list
    const pendingRes = await request(app).get("/bills?status=pending")
      .set("Authorization", `Bearer ${token}`);
    expect(pendingRes.body.items).toHaveLength(0);

    // Transaction appears in transaction list
    const txRes = await request(app).get("/transactions")
      .set("Authorization", `Bearer ${token}`);
    expect(txRes.body.data.some((tx) => tx.description === "Agua" && tx.type === "Saida")).toBe(true);
  });

  it("PATCH /bills/:id/mark-paid retorna 409 quando ja foi paga", async () => {
    const token = await registerAndLogin("bills-markpaid-dup@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Pagar", amount: 50, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    await request(app).patch(`/bills/${billId}/mark-paid`)
      .set("Authorization", `Bearer ${token}`).send({});

    const res = await request(app).patch(`/bills/${billId}/mark-paid`)
      .set("Authorization", `Bearer ${token}`).send({});

    expectErrorResponseWithRequestId(res, 409, "Pendencia ja foi paga.");
  });

  it("PATCH /bills/:id/mark-paid retorna 404 para bill de outro usuario", async () => {
    const token1 = await registerAndLogin("bills-mp-iso-1@test.dev");
    const token2 = await registerAndLogin("bills-mp-iso-2@test.dev");

    const createRes = await request(app).post("/bills").set("Authorization", `Bearer ${token1}`)
      .send({ title: "Alheia", amount: 100, dueDate: FUTURE_DATE });
    const billId = createRes.body.id;

    const res = await request(app).patch(`/bills/${billId}/mark-paid`)
      .set("Authorization", `Bearer ${token2}`).send({});

    expectErrorResponseWithRequestId(res, 404, "Pendencia nao encontrada.");
  });

  // ─── POST /bills/batch ───────────────────────────────────────────────────────

  describe("POST /bills/batch", () => {
    it("cria N parcelas atomicamente e retorna todas", async () => {
      const token = await registerAndLogin("bills-batch-create@test.dev");

      const bills = [
        { title: "IPTU (1/3)", amount: 500, dueDate: FUTURE_DATE },
        { title: "IPTU (2/3)", amount: 500, dueDate: toLocalDate(60) },
        { title: "IPTU (3/3)", amount: 500, dueDate: toLocalDate(90) },
      ];

      const res = await request(app)
        .post("/bills/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({ bills });

      expect(res.status).toBe(201);
      expect(res.body.bills).toHaveLength(3);
      expect(res.body.bills[0].title).toBe("IPTU (1/3)");
      expect(res.body.bills[1].title).toBe("IPTU (2/3)");
      expect(res.body.bills[2].title).toBe("IPTU (3/3)");
      expect(res.body.bills[0].amount).toBe(500);

      // Verify all 3 are persisted in DB
      const listRes = await request(app)
        .get("/bills")
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.body.pagination.total).toBe(3);
    });

    it("retorna 400 se bills array tiver menos de 2 items", async () => {
      const token = await registerAndLogin("bills-batch-min@test.dev");

      const res = await request(app)
        .post("/bills/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({ bills: [{ title: "A", amount: 100, dueDate: FUTURE_DATE }] });

      expectErrorResponseWithRequestId(res, 400, "Informe entre 2 e 24 parcelas.");
    });

    it("retorna 400 se bills array tiver mais de 24 items", async () => {
      const token = await registerAndLogin("bills-batch-max@test.dev");

      const bills = Array.from({ length: 25 }, (_, i) => ({
        title: `P ${i + 1}`,
        amount: 100,
        dueDate: FUTURE_DATE,
      }));

      const res = await request(app)
        .post("/bills/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({ bills });

      expectErrorResponseWithRequestId(res, 400, "Informe entre 2 e 24 parcelas.");
    });

    it("retorna 400 se qualquer parcela tiver campo invalido", async () => {
      const token = await registerAndLogin("bills-batch-invalid@test.dev");

      const res = await request(app)
        .post("/bills/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          bills: [
            { title: "Valida", amount: 100, dueDate: FUTURE_DATE },
            { title: "", amount: 100, dueDate: FUTURE_DATE }, // title vazio
          ],
        });

      expectErrorResponseWithRequestId(res, 400, "Titulo e obrigatorio.");
    });

    it("nao cria nenhuma bill se uma parcela for invalida (atomico)", async () => {
      const token = await registerAndLogin("bills-batch-atomic@test.dev");

      const res = await request(app)
        .post("/bills/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          bills: [
            { title: "Valida", amount: 100, dueDate: FUTURE_DATE },
            { title: "Invalida", amount: -50, dueDate: FUTURE_DATE }, // amount invalido
          ],
        });

      expect(res.status).toBe(400);

      // DB deve estar vazio — nenhuma bill criada
      const listRes = await request(app)
        .get("/bills")
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.body.pagination.total).toBe(0);
    });

    it("retorna 401 sem token", async () => {
      const res = await request(app)
        .post("/bills/batch")
        .send({ bills: [] });

      expect(res.status).toBe(401);
    });
  });

  // ─── Rate limiting ───────────────────────────────────────────────────────────

  it("POST /bills aplica rate limit por usuario", async () => {
    const token = await registerAndLogin("bills-ratelimit@test.dev");

    for (let i = 0; i < 60; i++) {
      const res = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
        .send({ title: `Conta ${i + 1}`, amount: 10, dueDate: FUTURE_DATE });
      expect(res.status).toBe(201);
    }

    const res = await request(app).post("/bills").set("Authorization", `Bearer ${token}`)
      .send({ title: "Limite", amount: 10, dueDate: FUTURE_DATE });

    expectErrorResponseWithRequestId(res, 429, "Muitas requisicoes. Tente novamente em instantes.");
  });

  it("POST /bills aceita billType e sourceImportSessionId", async () => {
    const token = await registerAndLogin("bills-bridge@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Conta de energia — ENEL",
        amount: 120.5,
        dueDate: FUTURE_DATE,
        billType: "energy",
        sourceImportSessionId: "import-session-abc",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Conta de energia — ENEL",
      billType: "energy",
      sourceImportSessionId: "import-session-abc",
    });
  });

  it("POST /bills ignora billType invalido", async () => {
    const token = await registerAndLogin("bills-invalid-type@test.dev");

    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Pendencia",
        amount: 50,
        dueDate: FUTURE_DATE,
        billType: "invalid_type",
      });

    expect(res.status).toBe(201);
    expect(res.body.billType).toBeNull();
  });

  it("PATCH /bills/:id bloqueia edição de fatura de cartão", async () => {
    const token = await registerAndLogin("bills-credit-card-edit@test.dev");

    const cardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Visa",
        limitTotal: 1200,
        closingDay: 10,
        dueDay: 20,
      });

    await request(app)
      .post(`/credit-cards/${cardRes.body.id}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Restaurante",
        amount: 89.9,
        purchaseDate: "2026-03-05",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${cardRes.body.id}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    const res = await request(app)
      .patch(`/bills/${closeRes.body.invoice.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Editar fatura" });

    expectErrorResponseWithRequestId(res, 409, "Fatura de cartao nao pode ser editada por esta tela.");
  });

  it("DELETE /bills/:id bloqueia exclusão de fatura de cartão", async () => {
    const token = await registerAndLogin("bills-credit-card-delete@test.dev");

    const cardRes = await request(app)
      .post("/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Elo",
        limitTotal: 800,
        closingDay: 10,
        dueDay: 20,
      });

    await request(app)
      .post(`/credit-cards/${cardRes.body.id}/purchases`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Cinema",
        amount: 45,
        purchaseDate: "2026-03-05",
      });

    const closeRes = await request(app)
      .post(`/credit-cards/${cardRes.body.id}/close-invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ closingDate: "2026-03-15" });

    const res = await request(app)
      .delete(`/bills/${closeRes.body.invoice.id}`)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(res, 409, "Fatura de cartao nao pode ser excluida por esta tela.");
  });
});
