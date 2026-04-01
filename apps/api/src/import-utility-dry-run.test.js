import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./domain/imports/document-classifier.js", async () => {
  const actual = await vi.importActual("./domain/imports/document-classifier.js");
  return {
    ...actual,
    detectDocumentType: vi.fn(),
  };
});

vi.mock("./domain/imports/statement-import.js", async () => {
  const actual = await vi.importActual("./domain/imports/statement-import.js");
  return {
    ...actual,
    extractTextFromPdfBuffer: vi.fn(),
    getPdfImportGuidanceError: vi.fn(),
    extractTelecomBillSuggestion: vi.fn(),
    extractGasBillSuggestion: vi.fn(),
  };
});

import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { detectDocumentType } from "./domain/imports/document-classifier.js";
import {
  extractGasBillSuggestion,
  extractTelecomBillSuggestion,
  extractTextFromPdfBuffer,
  getPdfImportGuidanceError,
} from "./domain/imports/statement-import.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  makeProUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("transaction imports utility bills dry-run", () => {
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
    vi.clearAllMocks();

    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");

    vi.mocked(getPdfImportGuidanceError).mockReturnValue(null);
    vi.mocked(extractTextFromPdfBuffer).mockResolvedValue("mocked pdf text");
  });

  it("POST /transactions/import/dry-run retorna documentType e suggestion para utility_bill_telecom", async () => {
    const token = await registerAndLogin("import-doctype-telecom@controlfinance.dev");
    await makeProUser("import-doctype-telecom@controlfinance.dev");

    vi.mocked(detectDocumentType).mockReturnValue("utility_bill_telecom");
    vi.mocked(extractTelecomBillSuggestion).mockReturnValue({
      type: "bill",
      billType: "internet",
      issuer: "VIVO",
      referenceMonth: "2026-04",
      dueDate: "2026-05-12",
      amountDue: 129.9,
      customerCode: "123456",
    });

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 telecom"), {
        filename: "telecom.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(200);
    expect(response.body.documentType).toBe("utility_bill_telecom");
    expect(response.body.summary).toEqual({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
      income: 0,
      expense: 0,
    });
    expect(response.body.suggestion).toMatchObject({
      type: "bill",
      billType: "internet",
      issuer: "VIVO",
      referenceMonth: "2026-04",
      dueDate: "2026-05-12",
      amountDue: 129.9,
      customerCode: "123456",
    });
    expect(response.body.suggestions).toEqual([
      expect.objectContaining({
        type: "bill",
        billType: "internet",
      }),
    ]);
  });

  it("POST /transactions/import/dry-run retorna documentType e suggestion para utility_bill_gas", async () => {
    const token = await registerAndLogin("import-doctype-gas@controlfinance.dev");
    await makeProUser("import-doctype-gas@controlfinance.dev");

    vi.mocked(detectDocumentType).mockReturnValue("utility_bill_gas");
    vi.mocked(extractGasBillSuggestion).mockReturnValue({
      type: "bill",
      billType: "gas",
      issuer: "COMGAS",
      referenceMonth: "2026-04",
      dueDate: "2026-05-15",
      amountDue: 95.4,
      customerCode: "778899",
    });

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 gas"), {
        filename: "gas.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(200);
    expect(response.body.documentType).toBe("utility_bill_gas");
    expect(response.body.summary).toEqual({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
      income: 0,
      expense: 0,
    });
    expect(response.body.suggestion).toMatchObject({
      type: "bill",
      billType: "gas",
      issuer: "COMGAS",
      referenceMonth: "2026-04",
      dueDate: "2026-05-15",
      amountDue: 95.4,
      customerCode: "778899",
    });
    expect(response.body.suggestions).toEqual([
      expect.objectContaining({
        type: "bill",
        billType: "gas",
      }),
    ]);
  });
});
