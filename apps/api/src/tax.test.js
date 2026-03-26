import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  expectErrorResponseWithRequestId,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { resolveTaxDocumentAbsolutePath } from "./services/tax-document-storage.service.js";

const TEST_TAX_STORAGE_DIR = path.join(os.tmpdir(), "control-finance-tax-documents-tests");
let previousTaxStorageDir = undefined;

const removeTaxStorageDir = async () => {
  await fs.rm(TEST_TAX_STORAGE_DIR, {
    recursive: true,
    force: true,
  });
};

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await removeTaxStorageDir();
  await dbQuery("DELETE FROM tax_reviews");
  await dbQuery("DELETE FROM tax_facts");
  await dbQuery("DELETE FROM tax_document_extractions");
  await dbQuery("DELETE FROM tax_documents");
  await dbQuery("DELETE FROM tax_rule_sets");
  await dbQuery("DELETE FROM tax_summaries");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

describe("Tax API foundation", () => {
  beforeAll(async () => {
    previousTaxStorageDir = process.env.TAX_DOCUMENTS_STORAGE_DIR;
    process.env.TAX_DOCUMENTS_STORAGE_DIR = TEST_TAX_STORAGE_DIR;
    await setupTestDb();
  });

  afterAll(async () => {
    await removeTaxStorageDir();
    if (typeof previousTaxStorageDir === "undefined") {
      delete process.env.TAX_DOCUMENTS_STORAGE_DIR;
    } else {
      process.env.TAX_DOCUMENTS_STORAGE_DIR = previousTaxStorageDir;
    }
    await clearDbClientForTests();
  });

  beforeEach(resetState);

  it("GET /tax retorna 401 sem token", async () => {
    const response = await request(app).get("/tax");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("GET /tax/documents retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/documents?taxYear=2026");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("POST /tax/documents retorna 401 sem token", async () => {
    const response = await request(app)
      .post("/tax/documents")
      .field("taxYear", "2026")
      .attach("file", Buffer.from("%PDF-1.4\nfake", "utf8"), {
        filename: "informe.pdf",
        contentType: "application/pdf",
      });

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("GET /tax/rules/:taxYear retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/rules/2026");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("GET /tax/summary/:taxYear retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/summary/2026");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("POST /tax/documents persiste metadata, hash e arquivo em storage local", async () => {
    const token = await registerAndLogin("tax-upload@test.dev");
    const fileBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj", "utf8");
    const response = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .field("sourceLabel", "Banco Inter")
      .field("sourceHint", "Informe 2025")
      .attach("file", fileBuffer, {
        filename: "informe-inter-2025.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.document).toMatchObject({
      taxYear: 2026,
      originalFileName: "informe-inter-2025.pdf",
      mimeType: "application/pdf",
      byteSize: fileBuffer.length,
      documentType: "unknown",
      processingStatus: "uploaded",
      sourceLabel: "Banco Inter",
      sourceHint: "Informe 2025",
    });
    expect(typeof response.body.document.sha256).toBe("string");
    expect(response.body.document.sha256).toHaveLength(64);

    const persistedDocumentResult = await dbQuery(
      `SELECT storage_key, stored_file_name, processing_status
       FROM tax_documents
       WHERE id = $1`,
      [response.body.document.id],
    );
    const persistedDocument = persistedDocumentResult.rows[0];

    expect(persistedDocument.processing_status).toBe("uploaded");
    expect(String(persistedDocument.stored_file_name)).toMatch(/^[a-f0-9]{64}\.pdf$/);

    const absolutePath = resolveTaxDocumentAbsolutePath(persistedDocument.storage_key);
    const storedFile = await fs.readFile(absolutePath);
    expect(storedFile.equals(fileBuffer)).toBe(true);
  });

  it("POST /tax/documents retorna 400 quando arquivo fiscal nao e enviado", async () => {
    const token = await registerAndLogin("tax-upload-missing-file@test.dev");
    const response = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026");

    expectErrorResponseWithRequestId(response, 400, "Arquivo fiscal (file) e obrigatorio.");
  });

  it("POST /tax/documents retorna 400 para formato nao suportado", async () => {
    const token = await registerAndLogin("tax-upload-invalid-file@test.dev");
    const response = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("conteudo texto puro", "utf8"), {
        filename: "anotacoes.txt",
        contentType: "text/plain",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Arquivo invalido. Envie um PDF, CSV, PNG ou JPG.",
    );
  });

  it("POST /tax/documents retorna 409 para documento duplicado do mesmo usuario", async () => {
    const token = await registerAndLogin("tax-upload-duplicate@test.dev");
    const fileBuffer = Buffer.from("%PDF-1.4\nduplicate", "utf8");

    const firstResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", fileBuffer, {
        filename: "informe-duplicado.pdf",
        contentType: "application/pdf",
      });

    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", fileBuffer, {
        filename: "informe-duplicado.pdf",
        contentType: "application/pdf",
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toMatchObject({
      message: "Documento ja enviado anteriormente.",
      code: "TAX_DOCUMENT_DUPLICATE",
    });
  });

  it("POST /tax/documents permite mesmo arquivo para usuarios diferentes", async () => {
    const tokenA = await registerAndLogin("tax-upload-user-a@test.dev");
    const tokenB = await registerAndLogin("tax-upload-user-b@test.dev");
    const sharedBuffer = Buffer.from("%PDF-1.4\nshared", "utf8");

    const responseA = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("taxYear", "2026")
      .attach("file", sharedBuffer, {
        filename: "shared.pdf",
        contentType: "application/pdf",
      });
    const responseB = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${tokenB}`)
      .field("taxYear", "2026")
      .attach("file", sharedBuffer, {
        filename: "shared.pdf",
        contentType: "application/pdf",
      });

    expect(responseA.status).toBe(201);
    expect(responseB.status).toBe(201);
    expect(responseA.body.document.sha256).toBe(responseB.body.document.sha256);
    expect(responseA.body.document.id).not.toBe(responseB.body.document.id);
  });

  it("GET /tax expõe o catalogo inicial do dominio fiscal", async () => {
    const token = await registerAndLogin("tax-bootstrap@test.dev");
    const response = await request(app)
      .get("/tax")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      module: "tax",
      scope: "irpf_mvp",
    });
    expect(Array.isArray(response.body.documentTypes)).toBe(true);
    expect(response.body.documentTypes).toContain("income_report_bank");
    expect(Array.isArray(response.body.ruleFamilies)).toBe(true);
    expect(response.body.ruleFamilies).toContain("obligation");
    expect(typeof response.body.apiVersion).toBe("string");
    expect(response.body.apiVersion.length).toBeGreaterThan(0);
  });

  it("GET /tax/documents retorna lista paginada vazia para o exercicio informado", async () => {
    const token = await registerAndLogin("tax-documents@test.dev");
    const response = await request(app)
      .get("/tax/documents?taxYear=2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("GET /tax/documents retorna documentos enviados pelo usuario autenticado", async () => {
    const token = await registerAndLogin("tax-documents-list@test.dev");

    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .field("sourceLabel", "Nubank")
      .attach("file", Buffer.from("Conta;Valor\nSaldo;10", "utf8"), {
        filename: "informe.csv",
        contentType: "text/csv",
      });

    expect(uploadResponse.status).toBe(201);

    const response = await request(app)
      .get("/tax/documents?taxYear=2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        id: uploadResponse.body.document.id,
        taxYear: 2026,
        originalFileName: "informe.csv",
        documentType: "unknown",
        processingStatus: "uploaded",
        sourceLabel: "Nubank",
      }),
    ]);
    expect(response.body.total).toBe(1);
  });

  it("GET /tax/documents retorna 400 quando taxYear nao e informado", async () => {
    const token = await registerAndLogin("tax-documents-missing-year@test.dev");
    const response = await request(app)
      .get("/tax/documents")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "taxYear invalido.");
  });

  it("GET /tax/documents/:id retorna detalhe com latestExtraction nulo antes da classificacao", async () => {
    const token = await registerAndLogin("tax-documents-detail@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .field("sourceLabel", "XP")
      .attach("file", Buffer.from("%PDF-1.4\ndetail", "utf8"), {
        filename: "xp.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);

    const detailResponse = await request(app)
      .get(`/tax/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toEqual({
      document: {
        ...uploadResponse.body.document,
        latestExtraction: null,
      },
    });
  });

  it("GET /tax/documents/:id retorna 404 para documento de outro usuario", async () => {
    const tokenA = await registerAndLogin("tax-documents-detail-a@test.dev");
    const tokenB = await registerAndLogin("tax-documents-detail-b@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("%PDF-1.4\nownership", "utf8"), {
        filename: "ownership.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);

    const detailResponse = await request(app)
      .get(`/tax/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expectErrorResponseWithRequestId(detailResponse, 404, "Documento fiscal nao encontrado.");
  });

  it("GET /tax/rules/:taxYear retorna estrutura vazia quando ainda nao ha regras ativas", async () => {
    const token = await registerAndLogin("tax-rules@test.dev");
    const response = await request(app)
      .get("/tax/rules/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      taxYear: 2026,
      exerciseYear: 2027,
      ruleSets: {},
      totalActiveRuleSets: 0,
    });
  });

  it("GET /tax/summary/:taxYear retorna esqueleto da trilha fiscal antes da primeira geracao", async () => {
    const token = await registerAndLogin("tax-summary@test.dev");
    const response = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      taxYear: 2026,
      status: "not_generated",
      snapshotVersion: null,
      mustDeclare: null,
      obligationReasons: [],
      annualTaxableIncome: 0,
      annualExemptIncome: 0,
      annualExclusiveIncome: 0,
      annualWithheldTax: 0,
      totalLegalDeductions: 0,
      simplifiedDiscountUsed: 0,
      bestMethod: null,
      estimatedAnnualTax: null,
      warnings: [],
      sourceCounts: {
        documents: 0,
        factsPending: 0,
        factsApproved: 0,
      },
      generatedAt: null,
    });
  });
});
