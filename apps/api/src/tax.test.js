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

  it("GET /tax/facts retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/facts?taxYear=2026");

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

  it("POST /tax/documents/:id/reprocess retorna 401 sem token", async () => {
    const response = await request(app).post("/tax/documents/1/reprocess");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("PATCH /tax/facts/:id/review retorna 401 sem token", async () => {
    const response = await request(app)
      .patch("/tax/facts/1/review")
      .send({ action: "approve" });

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("POST /tax/facts/bulk-review retorna 401 sem token", async () => {
    const response = await request(app)
      .post("/tax/facts/bulk-review")
      .send({ factIds: [1], action: "approve" });

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

  it("POST /tax/documents/:id/reprocess classifica, extrai e normaliza comprovante do empregador", async () => {
    const token = await registerAndLogin("tax-reprocess-employer@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Beneficiario Joao da Silva",
            "CPF 123.456.789-00",
            "Rendimentos tributaveis R$ 54.321,00",
            "Imposto sobre a renda retido na fonte R$ 4.321,09",
            "Decimo terceiro R$ 5.000,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "empregador.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);
    expect(reprocessResponse.body.document).toMatchObject({
      id: uploadResponse.body.document.id,
      documentType: "income_report_employer",
      processingStatus: "normalized",
    });
    expect(reprocessResponse.body.document.latestExtraction).toMatchObject({
      extractorName: "income-report-employer",
      classification: "income_report_employer",
    });

    const factsResult = await dbQuery(
      `SELECT
         fact_type,
         subcategory,
         amount,
         review_status,
         dedupe_strength,
         conflict_code
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );

    expect(factsResult.rows).toEqual([
      expect.objectContaining({
        fact_type: "taxable_income",
        subcategory: "annual_taxable_income",
        amount: 54321,
        review_status: "pending",
        dedupe_strength: "strong",
        conflict_code: null,
      }),
      expect.objectContaining({
        fact_type: "withheld_tax",
        subcategory: "annual_withheld_tax",
        amount: 4321.09,
        review_status: "pending",
        dedupe_strength: "strong",
        conflict_code: null,
      }),
      expect.objectContaining({
        fact_type: "exclusive_tax_income",
        subcategory: "thirteenth_salary",
        amount: 5000,
        review_status: "pending",
        dedupe_strength: "strong",
        conflict_code: null,
      }),
    ]);
  });

  it("POST /tax/documents/:id/reprocess normaliza extrato de apoio sem gerar facts", async () => {
    const token = await registerAndLogin("tax-reprocess-bank-support@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Data;Historico;Valor",
            "05/02/2026;Saldo anterior;100,00",
            "06/02/2026;Lancamentos;20,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "extrato.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);
    expect(reprocessResponse.body.document).toMatchObject({
      id: uploadResponse.body.document.id,
      documentType: "bank_statement_support",
      processingStatus: "normalized",
    });
    expect(reprocessResponse.body.document.latestExtraction).toMatchObject({
      extractorName: "classifier-only",
      classification: "bank_statement_support",
    });

    const factsCountResult = await dbQuery("SELECT COUNT(*) AS total FROM tax_facts");
    expect(Number(factsCountResult.rows[0].total)).toBe(0);
  });

  it("POST /tax/documents/:id/reprocess e idempotente para o mesmo documento", async () => {
    const token = await registerAndLogin("tax-reprocess-idempotent@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
            "Imposto sobre a renda retido na fonte R$ 4.321,09",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "empregador-idempotente.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const firstReprocess = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    const secondReprocess = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(firstReprocess.status).toBe(200);
    expect(secondReprocess.status).toBe(200);

    const factsCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_facts
       WHERE source_document_id = $1`,
      [uploadResponse.body.document.id],
    );

    expect(Number(factsCountResult.rows[0].total)).toBe(2);
  });

  it("POST /tax/documents/:id/reprocess marca fatos duplicados de outro documento como conflito fraco", async () => {
    const token = await registerAndLogin("tax-reprocess-conflict@test.dev");
    const sharedLines = [
      "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
      "Fonte pagadora ACME LTDA",
      "CNPJ 12.345.678/0001-90",
      "Rendimentos tributaveis R$ 54.321,00",
      "Imposto sobre a renda retido na fonte R$ 4.321,09",
    ];
    const firstUploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from(sharedLines.join("\n"), "utf8"), {
        filename: "empregador-a.csv",
        contentType: "text/csv",
      });
    const secondUploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from([...sharedLines, "Observacao reemitida"].join("\n"), "utf8"), {
        filename: "empregador-b.csv",
        contentType: "text/csv",
      });

    expect(firstUploadResponse.status).toBe(201);
    expect(secondUploadResponse.status).toBe(201);

    const firstReprocess = await request(app)
      .post(`/tax/documents/${firstUploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    const secondReprocess = await request(app)
      .post(`/tax/documents/${secondUploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(firstReprocess.status).toBe(200);
    expect(secondReprocess.status).toBe(200);

    const factsResult = await dbQuery(
      `SELECT source_document_id, dedupe_strength, conflict_code
       FROM tax_facts
       ORDER BY source_document_id ASC, id ASC`,
    );

    expect(factsResult.rows).toEqual([
      expect.objectContaining({
        source_document_id: firstUploadResponse.body.document.id,
        dedupe_strength: "strong",
        conflict_code: null,
      }),
      expect.objectContaining({
        source_document_id: firstUploadResponse.body.document.id,
        dedupe_strength: "strong",
        conflict_code: null,
      }),
      expect.objectContaining({
        source_document_id: secondUploadResponse.body.document.id,
        dedupe_strength: "weak",
        conflict_code: "TAX_FACT_DUPLICATE",
      }),
      expect.objectContaining({
        source_document_id: secondUploadResponse.body.document.id,
        dedupe_strength: "weak",
        conflict_code: "TAX_FACT_DUPLICATE",
      }),
    ]);
  });

  it("POST /tax/documents/:id/reprocess retorna 404 para documento de outro usuario", async () => {
    const tokenA = await registerAndLogin("tax-reprocess-a@test.dev");
    const tokenB = await registerAndLogin("tax-reprocess-b@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("Informe de Rendimentos\nBanco Inter", "utf8"), {
        filename: "informe.csv",
        contentType: "text/csv",
      });

    expect(uploadResponse.status).toBe(201);

    const response = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${tokenB}`);

    expectErrorResponseWithRequestId(response, 404, "Documento fiscal nao encontrado.");
  });

  it("GET /tax/facts retorna fatos pendentes com documento de origem", async () => {
    const token = await registerAndLogin("tax-facts-list@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .field("sourceLabel", "ACME")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
            "Imposto sobre a renda retido na fonte R$ 4.321,09",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "facts-list.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    const factsResponse = await request(app)
      .get("/tax/facts?taxYear=2026&reviewStatus=pending")
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);
    expect(factsResponse.status).toBe(200);
    expect(factsResponse.body.total).toBe(2);
    expect(factsResponse.body.items).toEqual([
      expect.objectContaining({
        factType: "withheld_tax",
        reviewStatus: "pending",
        sourceDocument: expect.objectContaining({
          id: uploadResponse.body.document.id,
          originalFileName: "facts-list.csv",
          documentType: "income_report_employer",
          processingStatus: "normalized",
          sourceLabel: "ACME",
        }),
      }),
      expect.objectContaining({
        factType: "taxable_income",
        reviewStatus: "pending",
        sourceDocument: expect.objectContaining({
          id: uploadResponse.body.document.id,
          originalFileName: "facts-list.csv",
          documentType: "income_report_employer",
          processingStatus: "normalized",
          sourceLabel: "ACME",
        }),
      }),
    ]);
  });

  it("PATCH /tax/facts/:id/review aprova fato e registra trilha em tax_reviews", async () => {
    const token = await registerAndLogin("tax-facts-approve@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "facts-approve.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    expect(reprocessResponse.status).toBe(200);

    const factResult = await dbQuery(
      `SELECT id, updated_at
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [uploadResponse.body.document.id],
    );
    const factId = Number(factResult.rows[0].id);
    const previousUpdatedAt = new Date(factResult.rows[0].updated_at).toISOString();

    const reviewResponse = await request(app)
      .patch(`/tax/facts/${factId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        action: "approve",
        note: "Conferido com o informe original.",
      });

    expect(reviewResponse.status).toBe(200);
    expect(reviewResponse.body.fact).toMatchObject({
      id: factId,
      reviewStatus: "approved",
    });

    const persistedFactResult = await dbQuery(
      `SELECT review_status, updated_at
       FROM tax_facts
       WHERE id = $1`,
      [factId],
    );
    const persistedReviewResult = await dbQuery(
      `SELECT review_action, previous_payload_json, corrected_payload_json, note
       FROM tax_reviews
       WHERE tax_fact_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [factId],
    );

    expect(persistedFactResult.rows[0].review_status).toBe("approved");
    expect(new Date(persistedFactResult.rows[0].updated_at).toISOString()).not.toBe(
      previousUpdatedAt,
    );
    expect(persistedReviewResult.rows[0]).toMatchObject({
      review_action: "approve",
      corrected_payload_json: {},
      note: "Conferido com o informe original.",
    });
    expect(persistedReviewResult.rows[0].previous_payload_json).toMatchObject({
      id: factId,
      reviewStatus: "pending",
    });
  });

  it("PATCH /tax/facts/:id/review corrige fato, recalcula chave logica e registra before/after", async () => {
    const token = await registerAndLogin("tax-facts-correct@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "facts-correct.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    expect(reprocessResponse.status).toBe(200);

    const factResult = await dbQuery(
      `SELECT id, dedupe_key
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [uploadResponse.body.document.id],
    );
    const factId = Number(factResult.rows[0].id);
    const previousDedupeKey = factResult.rows[0].dedupe_key;

    const reviewResponse = await request(app)
      .patch(`/tax/facts/${factId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        action: "correct",
        corrected: {
          amount: 54000,
          subcategory: "annual_taxable_income_adjusted",
        },
        note: "Ajuste manual apos conferencia.",
      });

    expect(reviewResponse.status).toBe(200);
    expect(reviewResponse.body.fact).toMatchObject({
      id: factId,
      reviewStatus: "corrected",
      subcategory: "annual_taxable_income_adjusted",
      amount: 54000,
      dedupeStrength: "strong",
    });

    const persistedFactResult = await dbQuery(
      `SELECT amount, subcategory, dedupe_key, review_status
       FROM tax_facts
       WHERE id = $1`,
      [factId],
    );
    const persistedReviewResult = await dbQuery(
      `SELECT review_action, previous_payload_json, corrected_payload_json, note
       FROM tax_reviews
       WHERE tax_fact_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [factId],
    );

    expect(Number(persistedFactResult.rows[0].amount)).toBe(54000);
    expect(persistedFactResult.rows[0].subcategory).toBe("annual_taxable_income_adjusted");
    expect(persistedFactResult.rows[0].review_status).toBe("corrected");
    expect(persistedFactResult.rows[0].dedupe_key).not.toBe(previousDedupeKey);
    expect(persistedReviewResult.rows[0]).toMatchObject({
      review_action: "correct",
      note: "Ajuste manual apos conferencia.",
    });
    expect(persistedReviewResult.rows[0].previous_payload_json).toMatchObject({
      id: factId,
      amount: 54321,
      reviewStatus: "pending",
    });
    expect(persistedReviewResult.rows[0].corrected_payload_json).toMatchObject({
      id: factId,
      amount: 54000,
      subcategory: "annual_taxable_income_adjusted",
      reviewStatus: "corrected",
    });
  });

  it("POST /tax/facts/bulk-review aprova varios fatos e registra bulk_approve", async () => {
    const token = await registerAndLogin("tax-facts-bulk@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
            "Imposto sobre a renda retido na fonte R$ 4.321,09",
            "Decimo terceiro R$ 5.000,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "facts-bulk.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    expect(reprocessResponse.status).toBe(200);

    const factsResult = await dbQuery(
      `SELECT id
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );
    const factIds = factsResult.rows.map((row) => Number(row.id));

    const bulkResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
        note: "Aprovacao em lote.",
      });

    expect(bulkResponse.status).toBe(200);
    expect(bulkResponse.body).toEqual({
      updatedCount: 3,
    });

    const persistedFactsResult = await dbQuery(
      `SELECT review_status
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );
    const persistedReviewsResult = await dbQuery(
      `SELECT tr.review_action, tr.note
       FROM tax_reviews tr
       INNER JOIN tax_facts tf
         ON tf.id = tr.tax_fact_id
       WHERE tf.source_document_id = $1
       ORDER BY tr.id ASC`,
      [uploadResponse.body.document.id],
    );
    const summaryResponse = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(persistedFactsResult.rows).toEqual([
      { review_status: "approved" },
      { review_status: "approved" },
      { review_status: "approved" },
    ]);
    expect(persistedReviewsResult.rows).toEqual([
      { review_action: "bulk_approve", note: "Aprovacao em lote." },
      { review_action: "bulk_approve", note: "Aprovacao em lote." },
      { review_action: "bulk_approve", note: "Aprovacao em lote." },
    ]);
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.sourceCounts).toEqual({
      documents: 1,
      factsPending: 0,
      factsApproved: 3,
    });
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

  it("GET /tax/summary/:taxYear atualiza sourceCounts apos normalizacao de facts pendentes", async () => {
    const token = await registerAndLogin("tax-summary-counts@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
            "Fonte pagadora ACME LTDA",
            "CNPJ 12.345.678/0001-90",
            "Rendimentos tributaveis R$ 54.321,00",
            "Imposto sobre a renda retido na fonte R$ 4.321,09",
            "Decimo terceiro R$ 5.000,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "empregador-summary.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);
    const summaryResponse = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.status).toBe("not_generated");
    expect(summaryResponse.body.sourceCounts).toEqual({
      documents: 1,
      factsPending: 3,
      factsApproved: 0,
    });
  });
});
