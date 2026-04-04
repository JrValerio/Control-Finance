import fs from "node:fs/promises";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

const mockExtractTextWithRuntime = vi.hoisted(() => vi.fn());

vi.mock("./domain/imports/pdf-ocr.js", () => ({
  extractTextFromPdfWithOcrRuntime: mockExtractTextWithRuntime,
  extractTextFromPdfWithOcr: vi.fn(async (...args) => {
    const result = await mockExtractTextWithRuntime(...args);
    if (typeof result === "string") {
      return result;
    }
    return String(result?.text || "");
  }),
  isImportOcrEnabled: () => false,
  shouldRunPdfOcrFallback: () => false,
}));

const GOLDEN_FIXTURE_PATH = new URL(
  "./domain/imports/corpus/credit-card-invoices/golden-v1.json",
  import.meta.url,
);

const sensitivePatterns = [
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, // CPF formatado
  /\b\d{11}\b/, // CPF sem formatacao
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
  /\b\d{13,19}\b/, // possivel numero de cartao completo
];

const createOcrRuntimeResult = (text) => ({
  text,
  ocrRuntime: {
    status: "success",
    reasonCode: "direct_text_sufficient",
    ocrEnabled: false,
    ocrAttempted: false,
    timeoutMs: null,
  },
});

const createCard = (token, overrides = {}) =>
  request(app)
    .post("/credit-cards")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Cartao Teste", limitTotal: 5000, closingDay: 7, dueDay: 15, ...overrides });

const uploadInvoice = (token, cardId) =>
  request(app)
    .post(`/credit-cards/${cardId}/invoices/parse-pdf`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", Buffer.from("fake-pdf", "utf8"), {
      filename: "fatura.pdf",
      contentType: "application/pdf",
    });

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  mockExtractTextWithRuntime.mockReset();
  await dbQuery("DELETE FROM credit_card_invoices");
  await dbQuery("DELETE FROM credit_card_purchases");
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM credit_cards");
  await dbQuery("DELETE FROM users");
};

let goldenFixtures;

describe("credit-card-invoices golden corpus", () => {
  beforeAll(async () => {
    await setupTestDb();
    const fixtureRaw = await fs.readFile(GOLDEN_FIXTURE_PATH, "utf8");
    goldenFixtures = JSON.parse(fixtureRaw);
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(resetState);

  it("corpus v1 respeita politica de anonimizacao minima", () => {
    expect(goldenFixtures?.version).toBe("1.0.0");
    expect(goldenFixtures?.anonymizationPolicyVersion).toBe("1.0.0");
    expect(Array.isArray(goldenFixtures?.cases)).toBe(true);

    for (const fixture of goldenFixtures.cases) {
      const text = String(fixture?.invoiceText || "");
      for (const pattern of sensitivePatterns) {
        expect(pattern.test(text), `fixture ${fixture?.id} viola anonimizacao: ${pattern}`).toBe(false);
      }
    }
  });

  it("corpus v1 valida golden contract de parse e confirmacao", async () => {
    for (const fixture of goldenFixtures.cases) {
      const token = await registerAndLogin(`golden-${fixture.id}@test.dev`);

      mockExtractTextWithRuntime.mockResolvedValue(createOcrRuntimeResult(fixture.invoiceText));

      const cardRes = await createCard(token, fixture.card || {});
      expect(cardRes.status, `createCard failed for ${fixture.id}`).toBe(201);
      const cardId = cardRes.body.id;

      const parseRes = await uploadInvoice(token, cardId);
      expect(parseRes.status, `parse invoice failed for ${fixture.id}`).toBe(201);

      expect(parseRes.body.issuer).toBe(fixture.expected.issuer);
      expect(parseRes.body.parseConfidence).toBe(fixture.expected.parseConfidence);
      expect(parseRes.body.classificationConfidence).toBe(fixture.expected.classificationConfidence);
      expect(parseRes.body.classificationAmbiguous).toBe(fixture.expected.classificationAmbiguous);
      expect(parseRes.body.reasonCode).toBe(fixture.expected.reasonCode);
      expect(parseRes.body.requiresUserConfirmation).toBe(fixture.expected.requiresUserConfirmation);
      expect(parseRes.body.totalAmount).toBe(fixture.expected.totalAmount);
      expect(parseRes.body.dueDate).toBe(fixture.expected.dueDate);

      const billRes = await request(app)
        .post("/bills")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: `Golden bill ${fixture.id}`,
          amount: fixture.expected.totalAmount,
          dueDate: fixture.expected.dueDate,
          billType: "credit_card_invoice",
        });
      expect(billRes.status, `create bill failed for ${fixture.id}`).toBe(201);

      await dbQuery(
        `UPDATE bills SET credit_card_id = $1, bill_type = 'credit_card_invoice' WHERE id = $2`,
        [cardId, billRes.body.id],
      );

      if (fixture.expected.requiresUserConfirmation) {
        const blockedRes = await request(app)
          .post(`/credit-cards/${cardId}/invoices/${parseRes.body.id}/link-bill`)
          .set("Authorization", `Bearer ${token}`)
          .send({ billId: billRes.body.id });

        expect(blockedRes.status, `expected block on ambiguous case ${fixture.id}`).toBe(422);
        expect(blockedRes.body.code).toBe(fixture.expected.blockedCode);

        const confirmedRes = await request(app)
          .post(`/credit-cards/${cardId}/invoices/${parseRes.body.id}/link-bill`)
          .set("Authorization", `Bearer ${token}`)
          .send({ billId: billRes.body.id, confirmAmbiguousClassification: true });

        expect(confirmedRes.status, `expected manual confirmation success for ${fixture.id}`).toBe(200);
      } else {
        const linkRes = await request(app)
          .post(`/credit-cards/${cardId}/invoices/${parseRes.body.id}/link-bill`)
          .set("Authorization", `Bearer ${token}`)
          .send({ billId: billRes.body.id });

        expect(linkRes.status, `expected auto accept for ${fixture.id}`).toBe(200);
      }
    }
  });
});
