import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin, expectErrorResponseWithRequestId } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

// ─── Mock pdf-ocr so tests run without real PDF toolchain ─────────────────────

const mockExtractText = vi.hoisted(() => vi.fn());

vi.mock("./domain/imports/pdf-ocr.js", () => ({
  extractTextFromPdfWithOcr: mockExtractText,
  isImportOcrEnabled: () => false,
  shouldRunPdfOcrFallback: () => false,
}));

// ─── Sample Itaú invoice text ─────────────────────────────────────────────────

const VALID_ITAU_TEXT = `
BANCO ITAÚ S.A.
**** 1234
PERÍODO DE 08/02/2026 A 07/03/2026
VENCIMENTO  15/03/2026
TOTAL DA FATURA    R$ 1.247,80
PAGAMENTO MÍNIMO R$ 124,78
`.trim();

const ITAU_TEXT_NO_PERIOD = `
BANCO ITAÚ S.A.
VENCIMENTO  15/03/2026
TOTAL DA FATURA    R$ 850,00
`.trim();

const INVALID_TEXT = `Este texto nao tem nenhum dado de fatura.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createCard = (token, overrides = {}) =>
  request(app)
    .post("/credit-cards")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Itaú Mastercard", limitTotal: 5000, closingDay: 7, dueDay: 15, ...overrides });

const uploadInvoice = (token, cardId, bufferContent = "fake-pdf") =>
  request(app)
    .post(`/credit-cards/${cardId}/invoices/parse-pdf`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", Buffer.from(bufferContent, "utf8"), {
      filename: "fatura.pdf",
      contentType: "application/pdf",
    });

// ─── State reset ──────────────────────────────────────────────────────────────

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  mockExtractText.mockReset();
  await dbQuery("DELETE FROM credit_card_invoices");
  await dbQuery("DELETE FROM credit_card_purchases");
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM credit_cards");
  await dbQuery("DELETE FROM users");
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("credit-card-invoices", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(resetState);

  // ─── Auth ───────────────────────────────────────────────────────────────────

  it("POST /credit-cards/:id/invoices/parse-pdf bloqueia sem token", async () => {
    const res = await request(app)
      .post("/credit-cards/1/invoices/parse-pdf")
      .attach("file", Buffer.from("fake", "utf8"), { filename: "f.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(401);
  });

  it("GET /credit-cards/:id/invoices bloqueia sem token", async () => {
    const res = await request(app).get("/credit-cards/1/invoices");
    expect(res.status).toBe(401);
  });

  // ─── parse-pdf ──────────────────────────────────────────────────────────────

  it("POST parse-pdf retorna 201 com campos corretos para fatura valida", async () => {
    const token = await registerAndLogin("inv-parse-ok@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const res = await uploadInvoice(token, cardId);

    expect(res.status).toBe(201);
    expect(res.body.creditCardId).toBe(cardId);
    expect(res.body.issuer).toBe("itau");
    expect(res.body.cardLast4).toBe("1234");
    expect(res.body.totalAmount).toBe(1247.80);
    expect(res.body.dueDate).toBe("2026-03-15");
    expect(res.body.periodStart).toBe("2026-02-08");
    expect(res.body.periodEnd).toBe("2026-03-07");
    expect(res.body.minimumPayment).toBe(124.78);
    expect(res.body.parseConfidence).toBe("high");
    expect(res.body.linkedBillId).toBeNull();
  });

  it("POST parse-pdf infere periodo quando ausente no PDF (parse_confidence=low)", async () => {
    const token = await registerAndLogin("inv-infer@test.dev");
    mockExtractText.mockResolvedValue(ITAU_TEXT_NO_PERIOD);

    // closing_day=7, dueDate=15/03/2026 → period_end=07/03/2026, period_start=08/02/2026
    const cardRes = await createCard(token, { closingDay: 7, dueDay: 15 });
    const cardId = cardRes.body.id;

    const res = await uploadInvoice(token, cardId);

    expect(res.status).toBe(201);
    expect(res.body.parseConfidence).toBe("low");
    expect(res.body.periodStart).not.toBeNull();
    expect(res.body.periodEnd).not.toBeNull();
    expect(res.body.parseMetadata.fieldsSources.periodStart).toBe("inference:closing_day");
    expect(res.body.parseMetadata.inferenceContext.closingDay).toBe(7);
  });

  it("POST parse-pdf retorna 422 INVOICE_PARSE_FAILED para texto ilegivel", async () => {
    const token = await registerAndLogin("inv-parse-fail@test.dev");
    mockExtractText.mockResolvedValue(INVALID_TEXT);

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const res = await uploadInvoice(token, cardId);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("INVOICE_PARSE_FAILED");
  });

  it("POST parse-pdf retorna 404 para cartao de outro usuario", async () => {
    const token1 = await registerAndLogin("inv-iso-1@test.dev");
    const token2 = await registerAndLogin("inv-iso-2@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token1);
    const cardId = cardRes.body.id;

    const res = await uploadInvoice(token2, cardId);

    expect(res.status).toBe(404);
  });

  it("POST parse-pdf retorna 400 quando arquivo nao e PDF", async () => {
    const token = await registerAndLogin("inv-not-pdf@test.dev");
    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const res = await request(app)
      .post(`/credit-cards/${cardId}/invoices/parse-pdf`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("col1,col2\n1,2", "utf8"), {
        filename: "data.csv",
        contentType: "text/csv",
      });

    expect(res.status).toBe(400);
  });

  it("POST parse-pdf retorna 400 quando file nao enviado", async () => {
    const token = await registerAndLogin("inv-no-file@test.dev");
    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const res = await request(app)
      .post(`/credit-cards/${cardId}/invoices/parse-pdf`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  // ─── GET invoices ────────────────────────────────────────────────────────────

  it("GET /invoices retorna lista de faturas do cartao", async () => {
    const token = await registerAndLogin("inv-list@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    await uploadInvoice(token, cardId);
    await uploadInvoice(token, cardId); // second upload same text (fine for test)

    const res = await request(app)
      .get(`/credit-cards/${cardId}/invoices`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].creditCardId).toBe(cardId);
  });

  it("GET /invoices retorna 404 para cartao de outro usuario", async () => {
    const token1 = await registerAndLogin("inv-list-iso-1@test.dev");
    const token2 = await registerAndLogin("inv-list-iso-2@test.dev");

    const cardRes = await createCard(token1);
    const cardId = cardRes.body.id;

    const res = await request(app)
      .get(`/credit-cards/${cardId}/invoices`)
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });

  // ─── link-bill ───────────────────────────────────────────────────────────────

  it("POST link-bill vincula fatura a uma pendencia", async () => {
    const token = await registerAndLogin("inv-link@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const invRes = await uploadInvoice(token, cardId);
    const invoiceId = invRes.body.id;

    // Create a bill with matching credit_card_id
    const billRes = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Fatura Itaú março",
        amount: 1247.80,
        dueDate: "2026-03-15",
        billType: "credit_card_invoice",
      });
    // Manually set credit_card_id on the bill since the API doesn't expose it directly
    await dbQuery(
      `UPDATE bills SET credit_card_id = $1 WHERE id = $2`,
      [cardId, billRes.body.id]
    );
    const billId = billRes.body.id;

    const res = await request(app)
      .post(`/credit-cards/${cardId}/invoices/${invoiceId}/link-bill`)
      .set("Authorization", `Bearer ${token}`)
      .send({ billId });

    expect(res.status).toBe(200);
    expect(res.body.linkedBillId).toBe(billId);
  });

  it("POST link-bill retorna 409 quando fatura ja esta vinculada", async () => {
    const token = await registerAndLogin("inv-link-dup@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const invRes = await uploadInvoice(token, cardId);
    const invoiceId = invRes.body.id;

    const billRes = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Fatura março", amount: 1247.80, dueDate: "2026-03-15" });
    await dbQuery(`UPDATE bills SET credit_card_id = $1 WHERE id = $2`, [cardId, billRes.body.id]);
    const billId = billRes.body.id;

    // First link
    await request(app)
      .post(`/credit-cards/${cardId}/invoices/${invoiceId}/link-bill`)
      .set("Authorization", `Bearer ${token}`)
      .send({ billId });

    // Second link — should 409
    const res = await request(app)
      .post(`/credit-cards/${cardId}/invoices/${invoiceId}/link-bill`)
      .set("Authorization", `Bearer ${token}`)
      .send({ billId });

    expect(res.status).toBe(409);
  });

  it("POST link-bill retorna 404 para fatura de outro usuario", async () => {
    const token1 = await registerAndLogin("inv-link-iso-1@test.dev");
    const token2 = await registerAndLogin("inv-link-iso-2@test.dev");
    mockExtractText.mockResolvedValue(VALID_ITAU_TEXT);

    const cardRes = await createCard(token1);
    const cardId = cardRes.body.id;

    const invRes = await uploadInvoice(token1, cardId);
    const invoiceId = invRes.body.id;

    const billRes = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token2}`)
      .send({ title: "Minha conta", amount: 100, dueDate: "2026-03-15" });
    const billId = billRes.body.id;

    const res = await request(app)
      .post(`/credit-cards/${cardId}/invoices/${invoiceId}/link-bill`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ billId });

    expect(res.status).toBe(404); // invoice not found for token2
  });
});
