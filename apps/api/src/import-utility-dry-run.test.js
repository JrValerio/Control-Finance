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
  getImportMetricsSnapshot,
  resetImportObservabilityForTests,
} from "./observability/import-observability.js";
import {
  makeProUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

const getImportMetricValue = (metricsText, metricName, labels = {}) => {
  const labelSegments = Object.entries(labels).map(
    ([labelName, labelValue]) => `(?=[^}]*${labelName}="${labelValue}")`,
  );
  const labelsPattern =
    labelSegments.length > 0 ? `\\{${labelSegments.join("")}[^}]*\\}` : "";
  const expression = new RegExp(`${metricName}${labelsPattern}\\s+([0-9.]+)`);
  const match = metricsText.match(expression);

  if (!match) {
    return 0;
  }

  return Number(match[1] || 0);
};

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
    resetImportObservabilityForTests();
    vi.clearAllMocks();

    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");

    vi.mocked(getPdfImportGuidanceError).mockReturnValue(null);
    vi.mocked(extractTextFromPdfBuffer).mockResolvedValue("mocked pdf text");
  });

  it("POST /transactions/import/dry-run retorna codigo explicito quando OCR de PDF esta desativado", async () => {
    const token = await registerAndLogin("import-pdf-ocr-disabled@controlfinance.dev");
    await makeProUser("import-pdf-ocr-disabled@controlfinance.dev");

    vi.mocked(getPdfImportGuidanceError).mockReturnValue(
      "PDF sem texto reconhecivel. Tente OFX ou CSV.",
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 scanned"), {
        filename: "extrato-escaneado.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      message: "PDF sem texto reconhecivel. Tente OFX ou CSV.",
      code: "IMPORT_PDF_OCR_DISABLED",
    });
    expect(typeof response.body.requestId).toBe("string");
    expect(response.body.requestId).not.toHaveLength(0);
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
    const metricsResponse = await request(app).get("/metrics");

    expect(response.status).toBe(200);
    expect(metricsResponse.status).toBe(200);
    expect(response.body.documentType).toBe("utility_bill_telecom");
    expect(response.body.utilityBillImportDecision).toEqual({
      scope: "generic_boleto",
      decision: "blocked",
      reasonCode: "unsupported_auto_transaction_import",
    });
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

    const metrics = getImportMetricsSnapshot();
    expect(metrics.import_dry_run_semantic_drift_total).toBe(0);
    expect(metrics.import_dry_run_utility_gate_blocked_total).toBe(1);
    expect(metrics.import_dry_run_utility_gate_supported_total).toBe(0);
    expect(getImportMetricValue(metricsResponse.text, "import_dry_run_total")).toBe(1);
    expect(getImportMetricValue(metricsResponse.text, "import_dry_run_utility_gate_blocked_total")).toBe(1);
    expect(getImportMetricValue(metricsResponse.text, "import_rows_samples_total", { operation: "dry_run" })).toBe(1);
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
    expect(response.body.utilityBillImportDecision).toEqual({
      scope: "generic_boleto",
      decision: "blocked",
      reasonCode: "unsupported_auto_transaction_import",
    });
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

    const metrics = getImportMetricsSnapshot();
    expect(metrics.import_dry_run_semantic_drift_total).toBe(0);
    expect(metrics.import_dry_run_utility_gate_blocked_total).toBe(1);
    expect(metrics.import_dry_run_utility_gate_supported_total).toBe(0);
  });

  it("POST /transactions/import/dry-run incrementa metrica quando suggestion diverge do documentType utilitario", async () => {
    const token = await registerAndLogin("import-doctype-drift@controlfinance.dev");
    await makeProUser("import-doctype-drift@controlfinance.dev");

    vi.mocked(detectDocumentType).mockReturnValue("utility_bill_gas");
    vi.mocked(extractGasBillSuggestion).mockReturnValue({
      type: "bill",
      billType: "water",
      issuer: "COMGAS",
      referenceMonth: "2026-04",
      dueDate: "2026-05-15",
      amountDue: 95.4,
      customerCode: "778899",
    });

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 gas drift"), {
        filename: "gas-drift.pdf",
        contentType: "application/pdf",
      });
    const metricsResponse = await request(app).get("/metrics");

    expect(response.status).toBe(200);
    expect(metricsResponse.status).toBe(200);
    expect(response.body.documentType).toBe("utility_bill_gas");
    expect(response.body.utilityBillImportDecision).toEqual({
      scope: "generic_boleto",
      decision: "blocked",
      reasonCode: "unsupported_auto_transaction_import",
    });
    expect(response.body.suggestion).toMatchObject({
      billType: "water",
    });

    const metrics = getImportMetricsSnapshot();
    expect(metrics.import_dry_run_total).toBe(1);
    expect(metrics.import_dry_run_semantic_drift_total).toBe(1);
    expect(metrics.import_dry_run_utility_gate_blocked_total).toBe(1);
    expect(metrics.import_dry_run_utility_gate_supported_total).toBe(0);
    expect(getImportMetricValue(metricsResponse.text, "import_dry_run_semantic_drift_total")).toBe(1);
  });

  it("POST /transactions/import/dry-run explica quando o PDF e historico de emprestimo consignado do INSS", async () => {
    const token = await registerAndLogin("import-consignado-inss@controlfinance.dev");
    await makeProUser("import-consignado-inss@controlfinance.dev");

    vi.mocked(extractTextFromPdfBuffer).mockResolvedValue([
      "Instituto Nacional do Seguro Social",
      "HISTORICO DE EMPRESTIMO CONSIGNADO",
      "Beneficio NB: 177.682.989-9",
      "Situacao: Ativo",
    ].join("\n"));

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 consignado"), {
        filename: "consignado.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Este PDF e um historico de emprestimo consignado do INSS. Para importar renda, envie o Historico de Creditos do beneficio.",
    );
    expect(vi.mocked(detectDocumentType)).not.toHaveBeenCalled();
  });
});
