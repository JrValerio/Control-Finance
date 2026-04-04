import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { setupTestDb, registerAndLogin } from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { resetCreditCardInvoiceImportJobsForTests } from "./services/credit-card-invoice-import-jobs.service.js";

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

const VALID_ITAU_TEXT = `
BANCO ITAU S.A.
**** 1234
PERIODO DE 08/02/2026 A 07/03/2026
VENCIMENTO  15/03/2026
TOTAL DA FATURA    R$ 1.247,80
PAGAMENTO MINIMO R$ 124,78
`.trim();

const INVALID_TEXT = "sem dados extraiveis de fatura";

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

const startAsyncInvoiceImport = (token, cardId, content = "fake-pdf") =>
  request(app)
    .post(`/credit-cards/${cardId}/invoices/parse-pdf-async`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", Buffer.from(content, "utf8"), {
      filename: "fatura.pdf",
      contentType: "application/pdf",
    });

const getImportJob = (token, cardId, jobId) =>
  request(app)
    .get(`/credit-cards/${cardId}/invoices/import-jobs/${jobId}`)
    .set("Authorization", `Bearer ${token}`);

const retryImportJob = (token, cardId, jobId) =>
  request(app)
    .post(`/credit-cards/${cardId}/invoices/import-jobs/${jobId}/retry`)
    .set("Authorization", `Bearer ${token}`)
    .send({});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForTerminalJobState = async (token, cardId, jobId, timeoutMs = 5000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await getImportJob(token, cardId, jobId);
    expect(response.status).toBe(200);

    if (["succeeded", "failed"].includes(response.body.status)) {
      return response.body;
    }

    await sleep(40);
  }

  throw new Error("Timeout aguardando estado terminal do job de importacao assincrona.");
};

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  resetCreditCardInvoiceImportJobsForTests();
  mockExtractTextWithRuntime.mockReset();

  await dbQuery("DELETE FROM credit_card_invoices");
  await dbQuery("DELETE FROM credit_card_purchases");
  await dbQuery("DELETE FROM bills");
  await dbQuery("DELETE FROM credit_cards");
  await dbQuery("DELETE FROM users");
};

describe("credit-card-invoice-import-jobs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(resetState);

  it("POST parse-pdf-async enfileira e completa job com status succeeded", async () => {
    const token = await registerAndLogin("invoice-import-job-success@test.dev");
    mockExtractTextWithRuntime.mockResolvedValue(createOcrRuntimeResult(VALID_ITAU_TEXT));

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const enqueueRes = await startAsyncInvoiceImport(token, cardId);

    expect(enqueueRes.status).toBe(202);
    expect(["queued", "processing", "succeeded"]).toContain(enqueueRes.body.status);
    expect(enqueueRes.body.attempts).toBeLessThanOrEqual(1);
    expect(enqueueRes.body.maxAttempts).toBeGreaterThanOrEqual(1);

    const terminalJob = await waitForTerminalJobState(token, cardId, enqueueRes.body.jobId);

    expect(terminalJob.status).toBe("succeeded");
    expect(terminalJob.attempts).toBe(1);
    expect(terminalJob.retryAvailable).toBe(false);
    expect(terminalJob.error).toBeNull();
    expect(terminalJob.invoice).toMatchObject({
      creditCardId: cardId,
      issuer: "itau",
      requiresUserConfirmation: false,
    });
  });

  it("POST import-jobs/:jobId/retry permite retry minimo observavel para job failed", async () => {
    const token = await registerAndLogin("invoice-import-job-retry@test.dev");
    mockExtractTextWithRuntime
      .mockResolvedValueOnce(createOcrRuntimeResult(INVALID_TEXT))
      .mockResolvedValueOnce(createOcrRuntimeResult(VALID_ITAU_TEXT));

    const cardRes = await createCard(token);
    const cardId = cardRes.body.id;

    const enqueueRes = await startAsyncInvoiceImport(token, cardId);
    expect(enqueueRes.status).toBe(202);

    const failedJob = await waitForTerminalJobState(token, cardId, enqueueRes.body.jobId);

    expect(failedJob.status).toBe("failed");
    expect(failedJob.attempts).toBe(1);
    expect(failedJob.retryAvailable).toBe(true);
    expect(failedJob.error?.code).toBe("INVOICE_PARSE_FAILED");

    const retryRes = await retryImportJob(token, cardId, enqueueRes.body.jobId);

    expect(retryRes.status).toBe(202);
    expect(["queued", "processing", "succeeded"]).toContain(retryRes.body.status);

    const succeededJob = await waitForTerminalJobState(token, cardId, enqueueRes.body.jobId);

    expect(succeededJob.status).toBe("succeeded");
    expect(succeededJob.attempts).toBe(2);
    expect(succeededJob.retryAvailable).toBe(false);
    expect(succeededJob.error).toBeNull();
    expect(succeededJob.invoice).toMatchObject({
      creditCardId: cardId,
      issuer: "itau",
    });
  });
});
