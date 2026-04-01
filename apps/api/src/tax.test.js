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

  it("POST /tax/facts retorna 401 sem token", async () => {
    const response = await request(app).post("/tax/facts").send({
      taxYear: 2026,
      factType: "taxable_income",
      subcategory: "Renda manual",
      referencePeriod: "2025-12",
      amount: 1200,
    });

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

  it("GET /tax/obligation/:taxYear retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/obligation/2026");

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

  it("GET /tax/export/:taxYear retorna 401 sem token", async () => {
    const response = await request(app).get("/tax/export/2026?format=json");

    expectErrorResponseWithRequestId(
      response,
      401,
      "Token de autenticacao ausente ou invalido.",
    );
  });

  it("POST /tax/summary/:taxYear/rebuild retorna 401 sem token", async () => {
    const response = await request(app).post("/tax/summary/2026/rebuild");

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

  it("DELETE /tax/documents/:id retorna 401 sem token", async () => {
    const response = await request(app).delete("/tax/documents/1");

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

  it("POST /tax/documents bloqueia upload quando o CPF do documento diverge do titular cadastrado", async () => {
    const email = "tax-upload-cpf-mismatch@test.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userId = Number(userResult.rows[0].id);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, '52998224725')`,
      [userId],
    );

    const response = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
            "Imposto sobre a Renda Retido na Fonte",
            "Exercicio de 2026 Ano-calendario de 2025",
            "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
            "214.679.738-07 AMARO VALERIO DA SILVA JUNIOR 1776829899",
            "3533-PROVENTOS DE APOSENT., RESERVA, REFORMA OU PENSAO PAGOS PELA PREV. SOCIAL",
            "1. Total dos rendimentos (inclusive ferias) 34.287,13",
            "5. Imposto sobre a renda retido na fonte 13,36",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "inss-mismatch.csv",
          contentType: "text/csv",
        },
      );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "TAX_DOCUMENT_TAXPAYER_CPF_MISMATCH",
      message:
        "Conflito de CPF divergente. Documento no CPF 214.679.738-07 e perfil fiscal no CPF 529.982.247-25.",
    });

    const persistedDocumentCount = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_documents
       WHERE user_id = $1`,
      [userId],
    );

    expect(Number(persistedDocumentCount.rows[0].total)).toBe(0);
  });

  it("POST /tax/documents permite upload quando o CPF do documento bate com o titular cadastrado", async () => {
    const email = "tax-upload-cpf-match@test.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userId = Number(userResult.rows[0].id);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, '43342760400')`,
      [userId],
    );

    const response = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
            "Imposto sobre a Renda Retido na Fonte",
            "Exercicio de 2026 Ano-calendario de 2025",
            "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
            "433.427.604-00 MARIA EDLEUSA MONSAO DA SILVA 1776829899",
            "3533-PROVENTOS DE APOSENT., RESERVA, REFORMA OU PENSAO PAGOS PELA PREV. SOCIAL",
            "1. Total dos rendimentos (inclusive ferias) 34.287,13",
            "5. Imposto sobre a renda retido na fonte 13,36",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "inss-match.csv",
          contentType: "text/csv",
        },
      );

    expect(response.status).toBe(201);
    expect(response.body.document.originalFileName).toBe("inss-match.csv");
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
    expect(response.body.documentTypes).toContain("clt_payslip");
    expect(Array.isArray(response.body.ruleFamilies)).toBe(true);
    expect(response.body.ruleFamilies).toContain("obligation");
    expect(Array.isArray(response.body.supportedTaxYears)).toBe(true);
    expect(response.body.supportedTaxYears).toContain(2026);
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

  it("DELETE /tax/documents/:id remove documento, fatos vinculados, trilha de revisao e arquivo fisico", async () => {
    const token = await registerAndLogin("tax-documents-delete@test.dev");
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
          filename: "delete-document.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const documentId = uploadResponse.body.document.id;
    const storageResult = await dbQuery(
      `SELECT storage_key
       FROM tax_documents
       WHERE id = $1`,
      [documentId],
    );
    const storageKey = storageResult.rows[0].storage_key;
    const absolutePath = resolveTaxDocumentAbsolutePath(storageKey);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${documentId}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);

    const factsResult = await dbQuery(
      `SELECT id
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [documentId],
    );
    const factId = Number(factsResult.rows[0].id);

    const reviewResponse = await request(app)
      .patch(`/tax/facts/${factId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        action: "approve",
        note: "Criando trilha para o delete.",
      });

    expect(reviewResponse.status).toBe(200);

    const deleteResponse = await request(app)
      .delete(`/tax/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      deletedDocumentId: documentId,
      deletedFactsCount: 2,
    });

    const persistedDocumentCount = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_documents
       WHERE id = $1`,
      [documentId],
    );
    const persistedExtractionCount = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_document_extractions
       WHERE document_id = $1`,
      [documentId],
    );
    const persistedFactsCount = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_facts
       WHERE source_document_id = $1`,
      [documentId],
    );
    const persistedReviewsCount = await dbQuery("SELECT COUNT(*) AS total FROM tax_reviews");

    expect(Number(persistedDocumentCount.rows[0].total)).toBe(0);
    expect(Number(persistedExtractionCount.rows[0].total)).toBe(0);
    expect(Number(persistedFactsCount.rows[0].total)).toBe(0);
    expect(Number(persistedReviewsCount.rows[0].total)).toBe(0);
    await expect(fs.access(absolutePath)).rejects.toThrow();
  });

  it("DELETE /tax/documents/:id retorna 404 para documento de outro usuario", async () => {
    const tokenA = await registerAndLogin("tax-documents-delete-a@test.dev");
    const tokenB = await registerAndLogin("tax-documents-delete-b@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("%PDF-1.4\ndelete-ownership", "utf8"), {
        filename: "delete-ownership.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete(`/tax/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expectErrorResponseWithRequestId(deleteResponse, 404, "Documento fiscal nao encontrado.");
  });

  it("DELETE /tax/documents/:id segue com sucesso quando o arquivo fisico ja nao existe", async () => {
    const token = await registerAndLogin("tax-documents-delete-missing-file@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("%PDF-1.4\nmissing-file", "utf8"), {
        filename: "missing-file.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);

    const documentId = uploadResponse.body.document.id;
    const storageResult = await dbQuery(
      `SELECT storage_key
       FROM tax_documents
       WHERE id = $1`,
      [documentId],
    );
    await fs.rm(resolveTaxDocumentAbsolutePath(storageResult.rows[0].storage_key), {
      force: true,
    });

    const deleteResponse = await request(app)
      .delete(`/tax/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      deletedDocumentId: documentId,
      deletedFactsCount: 0,
    });
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

  it("POST /tax/documents/:id/reprocess normaliza comprovante anual do INSS e o resumo deixa de zerar apos revisao", async () => {
    const token = await registerAndLogin("tax-reprocess-inss-annual@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
            "Imposto sobre a Renda Retido na Fonte",
            "Exercicio de 2026 Ano-calendario de 2025",
            "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
            "433.427.604-00 MARIA EDLEUSA MONSAO DA SILVA 1776829899",
            "3533-PROVENTOS DE APOSENT., RESERVA, REFORMA OU PENSAO PAGOS PELA PREV. SOCIAL",
            "1. Total dos rendimentos (inclusive ferias) 34.287,13",
            "2. Contribuicao previdenciaria oficial 0,00",
            "3. Contribuicoes a entidades de previdencia complementar e a fundos de aposentadoria programada Individual (FAPI) 0,00",
            "4. Pensao alimenticia (Informar o beneficiario no quadro 7) 0,00",
            "5. Imposto sobre a renda retido na fonte 13,36",
            "1. Parcela isenta dos proventos de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais), exceto a 22.847,76",
            "2. Parcela isenta do 13o salario de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais). 1.903,98",
            "1. Decimo terceiro salario 2.868,57",
            "2. Imposto sobre a renda retido na fonte sobre 13o salario 0,00",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "inss-anual.csv",
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
      documentType: "income_report_inss",
      processingStatus: "normalized",
    });
    expect(reprocessResponse.body.document.latestExtraction).toMatchObject({
      extractorName: "income-report-inss",
      classification: "income_report_inss",
    });

    const factsResult = await dbQuery(
      `SELECT fact_type, subcategory, amount
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );

    expect(factsResult.rows).toEqual([
      expect.objectContaining({
        fact_type: "taxable_income",
        subcategory: "inss_annual_taxable_income",
        amount: 34287.13,
      }),
      expect.objectContaining({
        fact_type: "withheld_tax",
        subcategory: "inss_annual_withheld_tax",
        amount: 13.36,
      }),
      expect.objectContaining({
        fact_type: "exempt_income",
        subcategory: "inss_retirement_65_plus_exempt",
        amount: 22847.76,
      }),
      expect.objectContaining({
        fact_type: "exempt_income",
        subcategory: "inss_retirement_65_plus_thirteenth_exempt",
        amount: 1903.98,
      }),
      expect.objectContaining({
        fact_type: "exclusive_tax_income",
        subcategory: "inss_thirteenth_salary_exclusive",
        amount: 2868.57,
      }),
    ]);

    const factIds = (
      await dbQuery(
        `SELECT id
         FROM tax_facts
         WHERE source_document_id = $1
         ORDER BY id ASC`,
        [uploadResponse.body.document.id],
      )
    ).rows.map((row) => Number(row.id));

    const approveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(approveResponse.status).toBe(200);

    const rebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(rebuildResponse.status).toBe(200);
    expect(rebuildResponse.body).toMatchObject({
      annualTaxableIncome: 34287.13,
      annualExemptIncome: 24751.74,
      annualExclusiveIncome: 2868.57,
      annualWithheldTax: 13.36,
      sourceCounts: {
        documents: 1,
        factsPending: 0,
        factsApproved: 5,
      },
    });
  });

  it("POST /tax/documents/:id/reprocess normaliza informe bancario anual itemizado", async () => {
    const token = await registerAndLogin("tax-reprocess-bank-annual@test.dev");
    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Informe de Rendimentos",
            "Ano Calendario 2025",
            "Cliente: MARIA EDILEUSA MONSAO DA SILVA CPF: 433.427.604-00",
            "Ficha da Declaracao: Rendimentos Sujeitos a Tributacao Exclusiva/Definitiva",
            "Contas de deposito, pagamento e aplicacoes financeiras",
            "Fonte Pagadora: Itau Unibanco S.A. CNPJ: 60.701.190/0001-04",
            "3613/0042196-9 06 RDB/CDB 0,16 0,00 0,16",
            "Total: 0,16 0,00 0,16",
            "Ficha da Declaracao: Bens e Direitos",
            "3613/0042196-9 06 01 CONTA CORRENTE 0,00 1,00",
            "3613/0042196-9 04 02 RDB/CDB 0,00 1.052,16",
            "Total: 0,00 1.053,16",
            "Ficha da Declaracao: Dividas e Onus Reais",
            "Credor: Itau Unibanco S.A. CNPJ: 60.701.190/0001-04",
            "3613/0042196-9 11 CREDITO CONSIGNADO",
            "INTERNO INSS 000002653219945 19/02/2025 0,00 3.308,88",
            "Total: 0,00 3.308,88",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "itau-anual.csv",
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
      documentType: "income_report_bank",
      processingStatus: "normalized",
    });
    expect(reprocessResponse.body.document.latestExtraction).toMatchObject({
      extractorName: "income-report-bank",
      classification: "income_report_bank",
    });

    const factsResult = await dbQuery(
      `SELECT fact_type, subcategory, amount, reference_period
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );

    expect(factsResult.rows).toEqual([
      expect.objectContaining({
        fact_type: "exclusive_tax_income",
        subcategory: "bank_annual_exclusive_income",
        amount: 0.16,
        reference_period: "2025-annual",
      }),
      expect.objectContaining({
        fact_type: "asset_balance",
        subcategory: "bank_account_balance",
        amount: 1,
        reference_period: "2025-12-31",
      }),
      expect.objectContaining({
        fact_type: "asset_balance",
        subcategory: "bank_investment_balance",
        amount: 1052.16,
        reference_period: "2025-12-31",
      }),
      expect.objectContaining({
        fact_type: "debt_balance",
        subcategory: "bank_debt_balance",
        amount: 3308.88,
        reference_period: "2025-12-31",
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

  it("POST /tax/facts cria fato manual pendente para a fila de revisao", async () => {
    const token = await registerAndLogin("tax-facts-manual@test.dev");
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1
       LIMIT 1`,
      ["tax-facts-manual@test.dev"],
    );
    const userId = Number(userResult.rows[0].id);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, $2)`,
      [userId, "52998224725"],
    );

    const createResponse = await request(app)
      .post("/tax/facts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        taxYear: 2026,
        factType: "taxable_income",
        subcategory: "Renda manual INSS",
        payerName: "INSS",
        payerDocument: "29.979.036/0001-40",
        referencePeriod: "2025-12",
        amount: 2803.52,
        note: "Lancamento manual de apoio.",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.fact).toMatchObject({
      factType: "taxable_income",
      category: "manual_entry",
      subcategory: "Renda manual INSS",
      payerName: "INSS",
      payerDocument: "29979036000140",
      referencePeriod: "2025-12",
      amount: 2803.52,
      reviewStatus: "pending",
      sourceDocument: null,
      conflictCode: null,
    });
    expect(createResponse.body.fact.metadata).toMatchObject({
      sourceOrigin: "manual_entry",
      ownerDocument: "52998224725",
      note: "Lancamento manual de apoio.",
    });

    const persistedFactResult = await dbQuery(
      `SELECT
         category,
         review_status,
         metadata_json
       FROM tax_facts
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [userId],
    );

    expect(persistedFactResult.rows[0]).toMatchObject({
      category: "manual_entry",
      review_status: "pending",
    });
    expect(persistedFactResult.rows[0].metadata_json).toMatchObject({
      sourceOrigin: "manual_entry",
      ownerDocument: "52998224725",
      note: "Lancamento manual de apoio.",
    });
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
    expect(reviewResponse.body.preview).toMatchObject({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      summary: expect.objectContaining({
        status: "preview",
        taxYear: 2026,
      }),
      obligation: expect.objectContaining({
        taxYear: 2026,
      }),
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
    expect(reviewResponse.body.preview).toMatchObject({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      summary: expect.objectContaining({
        status: "preview",
        taxYear: 2026,
      }),
      obligation: expect.objectContaining({
        taxYear: 2026,
      }),
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
    expect(bulkResponse.body).toMatchObject({
      updatedCount: 3,
      taxYear: 2026,
      preview: {
        taxYear: 2026,
        exerciseYear: 2026,
        calendarYear: 2025,
        summary: expect.objectContaining({
          status: "preview",
          taxYear: 2026,
          sourceCounts: {
            documents: 1,
            factsPending: 0,
            factsApproved: 3,
          },
        }),
        obligation: expect.objectContaining({
          taxYear: 2026,
          approvedFactsCount: 3,
        }),
      },
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

  it("POST /tax/facts/bulk-review retorna 400 quando recebe factIds de taxYears diferentes", async () => {
    const token = await registerAndLogin("tax-facts-bulk-mixed-taxyear@test.dev");

    const firstFactResponse = await request(app)
      .post("/tax/facts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        taxYear: 2026,
        factType: "taxable_income",
        subcategory: "manual_income_2026",
        referencePeriod: "2025-12",
        amount: 1000,
      });
    const secondFactResponse = await request(app)
      .post("/tax/facts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        taxYear: 2025,
        factType: "taxable_income",
        subcategory: "manual_income_2025",
        referencePeriod: "2024-12",
        amount: 900,
      });

    expect(firstFactResponse.status).toBe(201);
    expect(secondFactResponse.status).toBe(201);

    const response = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds: [firstFactResponse.body.fact.id, secondFactResponse.body.fact.id],
        action: "approve",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Aprovacao em lote exige fatos do mesmo exercicio fiscal (taxYear).",
    );
  });

  it("GET /tax/rules/:taxYear retorna regras oficiais seedadas para o exercicio 2026", async () => {
    const token = await registerAndLogin("tax-rules@test.dev");
    const response = await request(app)
      .get("/tax/rules/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.taxYear).toBe(2026);
    expect(response.body.exerciseYear).toBe(2026);
    expect(response.body.calendarYear).toBe(2025);
    expect(response.body.totalActiveRuleSets).toBe(4);
    expect(response.body.ruleSets).toMatchObject({
      obligation: {
        version: 1,
        sourceLabel: "Receita Federal - DIRPF 2026",
      },
      annual_table: {
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
      },
      deduction_limits: {
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
      },
      comparison_logic: {
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
      },
    });

    const persistedRulesResult = await dbQuery(
      `SELECT rule_family, version
       FROM tax_rule_sets
       WHERE tax_year = 2026
         AND is_active = TRUE
       ORDER BY rule_family ASC`,
    );

    expect(persistedRulesResult.rows).toEqual([
      { rule_family: "annual_table", version: 1 },
      { rule_family: "comparison_logic", version: 1 },
      { rule_family: "deduction_limits", version: 1 },
      { rule_family: "obligation", version: 1 },
    ]);
  });

  it("GET /tax/obligation/:taxYear considera apenas fatos approved ou corrected", async () => {
    const token = await registerAndLogin("tax-obligation@test.dev");
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
          filename: "obligation.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);

    const beforeApprovalResponse = await request(app)
      .get("/tax/obligation/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(beforeApprovalResponse.status).toBe(200);
    expect(beforeApprovalResponse.body).toMatchObject({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      mustDeclare: false,
      reasons: [],
      thresholds: {
        taxableIncome: 35584,
        exemptAndExclusiveIncome: 200000,
        assets: 800000,
        ruralRevenue: 177920,
      },
      totals: {
        annualTaxableIncome: 0,
        annualExemptIncome: 0,
        annualExclusiveIncome: 0,
        annualCombinedExemptAndExclusiveIncome: 0,
        totalAssetBalance: 0,
      },
      approvedFactsCount: 0,
    });

    const factsResult = await dbQuery(
      `SELECT id
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );
    const factIds = factsResult.rows.map((row) => Number(row.id));

    const bulkApproveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(bulkApproveResponse.status).toBe(200);

    const afterApprovalResponse = await request(app)
      .get("/tax/obligation/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(afterApprovalResponse.status).toBe(200);
    expect(afterApprovalResponse.body.mustDeclare).toBe(true);
    expect(afterApprovalResponse.body.reasons).toEqual([
      {
        code: "TAXABLE_INCOME_LIMIT",
        message: "Rendimentos tributaveis acima do limite do exercicio.",
      },
    ]);
    expect(afterApprovalResponse.body.totals).toMatchObject({
      annualTaxableIncome: 54321,
      annualExemptIncome: 0,
      annualExclusiveIncome: 5000,
      annualCombinedExemptAndExclusiveIncome: 5000,
      totalAssetBalance: 0,
    });
    expect(afterApprovalResponse.body.approvedFactsCount).toBe(3);
  });

  it("exclui do calculo oficial fatos revisados com CPF divergente do titular cadastrado", async () => {
    const email = "tax-obligation-taxpayer-filter@test.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userId = Number(userResult.rows[0].id);

    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach(
        "file",
        Buffer.from(
          [
            "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
            "Imposto sobre a Renda Retido na Fonte",
            "Exercicio de 2026 Ano-calendario de 2025",
            "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
            "433.427.604-00 MARIA EDLEUSA MONSAO DA SILVA 1776829899",
            "3533-PROVENTOS DE APOSENT., RESERVA, REFORMA OU PENSAO PAGOS PELA PREV. SOCIAL",
            "1. Total dos rendimentos (inclusive ferias) 34.287,13",
            "5. Imposto sobre a renda retido na fonte 13,36",
            "1. Parcela isenta dos proventos de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais), exceto a 22.847,76",
            "2. Parcela isenta do 13o salario de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais). 1.903,98",
            "1. Decimo terceiro salario 2.868,57",
          ].join("\n"),
          "utf8",
        ),
        {
          filename: "inss-taxpayer-mismatch.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, '52998224725')`,
      [userId],
    );

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

    const bulkApproveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(bulkApproveResponse.status).toBe(200);

    const obligationResponse = await request(app)
      .get("/tax/obligation/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(obligationResponse.status).toBe(200);
    expect(obligationResponse.body).toMatchObject({
      mustDeclare: false,
      approvedFactsCount: 0,
      taxpayerCpfConfigured: true,
      excludedFactsCount: 5,
      totals: {
        annualTaxableIncome: 0,
        annualExemptIncome: 0,
        annualExclusiveIncome: 0,
        annualWithheldTax: 0,
        totalLegalDeductions: 0,
      },
    });

    const rebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(rebuildResponse.status).toBe(200);
    expect(rebuildResponse.body).toMatchObject({
      annualTaxableIncome: 0,
      annualExemptIncome: 0,
      annualExclusiveIncome: 0,
      annualWithheldTax: 0,
      warnings: [
        {
          code: "TAXPAYER_CPF_MISMATCH_EXCLUDED",
          message:
            "Ha 5 fatos revisados com CPF divergente do titular cadastrado e eles ficaram fora do resumo anual.",
        },
      ],
    });

    const exportResponse = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    const exportPayload = JSON.parse(exportResponse.text);
    expect(exportPayload.manifest.factsIncluded).toBe(0);
    expect(exportPayload.summary.annualTaxableIncome).toBe(0);
    expect(exportPayload.facts).toEqual([]);
  });

  it("GET /tax/summary/:taxYear retorna esqueleto da trilha fiscal antes da primeira geracao", async () => {
    const token = await registerAndLogin("tax-summary@test.dev");
    const response = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
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

  it("GET /tax/summary/:taxYear retorna 404 quando nao ha regras fiscais ativas para o exercicio", async () => {
    const token = await registerAndLogin("tax-summary-rules-missing@test.dev");
    const response = await request(app)
      .get("/tax/summary/2030")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(
      response,
      404,
      "Regras fiscais ativas indisponiveis para o exercicio informado.",
    );
  });

  it("POST /tax/summary/:taxYear/rebuild gera snapshot versionado com fatos revisados", async () => {
    const token = await registerAndLogin("tax-summary-rebuild@test.dev");
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
          filename: "summary-rebuild.csv",
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

    const bulkApproveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(bulkApproveResponse.status).toBe(200);

    const rebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(rebuildResponse.status).toBe(200);
    expect(rebuildResponse.body).toMatchObject({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      status: "generated",
      snapshotVersion: 1,
      mustDeclare: true,
      obligationReasons: ["TAXABLE_INCOME_LIMIT"],
      annualTaxableIncome: 54321,
      annualExemptIncome: 0,
      annualExclusiveIncome: 5000,
      annualWithheldTax: 4321.09,
      totalLegalDeductions: 0,
      simplifiedDiscountUsed: 10864.2,
      bestMethod: "simplified_discount",
      estimatedAnnualTax: 1839.49,
      warnings: [],
      sourceCounts: {
        documents: 1,
        factsPending: 0,
        factsApproved: 3,
      },
    });
    expect(typeof rebuildResponse.body.generatedAt).toBe("string");

    const persistedSummariesResult = await dbQuery(
      `SELECT snapshot_version
       FROM tax_summaries
       WHERE user_id = (SELECT id FROM users WHERE email = 'tax-summary-rebuild@test.dev')
         AND tax_year = 2026
       ORDER BY snapshot_version ASC`,
    );

    expect(persistedSummariesResult.rows).toEqual([{ snapshot_version: 1 }]);

    const secondRebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);
    const getSummaryResponse = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(secondRebuildResponse.status).toBe(200);
    expect(secondRebuildResponse.body.snapshotVersion).toBe(2);
    expect(getSummaryResponse.status).toBe(200);
    expect(getSummaryResponse.body).toMatchObject({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      status: "generated",
      snapshotVersion: 2,
      mustDeclare: true,
      obligationReasons: ["TAXABLE_INCOME_LIMIT"],
      annualTaxableIncome: 54321,
      annualExclusiveIncome: 5000,
      annualWithheldTax: 4321.09,
      totalLegalDeductions: 0,
      simplifiedDiscountUsed: 10864.2,
      bestMethod: "simplified_discount",
      estimatedAnnualTax: 1839.49,
      sourceCounts: {
        documents: 1,
        factsPending: 0,
        factsApproved: 3,
      },
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

  it("GET /tax/export/:taxYear retorna 409 quando ainda nao existe snapshot do resumo", async () => {
    const token = await registerAndLogin("tax-export-missing-summary@test.dev");
    const response = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "Resumo fiscal ainda nao foi gerado para este exercicio.",
      code: "TAX_SUMMARY_NOT_GENERATED",
    });
  });

  it("GET /tax/export/:taxYear retorna 409 quando o snapshot legado ainda nao possui facts congelados", async () => {
    const email = "tax-export-rebuild-required@test.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userId = Number(userResult.rows[0].id);

    await dbQuery(
      `INSERT INTO tax_summaries (
         user_id,
         tax_year,
         snapshot_version,
         summary_json,
         source_counts_json
       )
       VALUES ($1, 2026, 1, $2::jsonb, $3::jsonb)`,
      [
        userId,
        JSON.stringify({
          annualTaxableIncome: 54321,
          annualExclusiveIncome: 5000,
          annualWithheldTax: 4321.09,
        }),
        JSON.stringify({
          documents: 1,
          factsPending: 0,
          factsApproved: 3,
        }),
      ],
    );

    const response = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "Resumo fiscal precisa ser regenerado para exportar o snapshot oficial deste exercicio.",
      code: "TAX_SUMMARY_REBUILD_REQUIRED",
    });
  });

  it("GET /tax/export/:taxYear permite snapshot vazio quando todos os fatos aprovados ficaram fora por CPF divergente", async () => {
    const email = "tax-export-empty-mismatch@test.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userId = Number(userResult.rows[0].id);

    await dbQuery(
      `INSERT INTO tax_summaries (
         user_id,
         tax_year,
         snapshot_version,
         summary_json,
         source_counts_json
       )
       VALUES ($1, 2026, 1, $2::jsonb, $3::jsonb)`,
      [
        userId,
        JSON.stringify({
          annualTaxableIncome: 0,
          annualExclusiveIncome: 0,
          annualWithheldTax: 0,
          warnings: [
            {
              code: "TAXPAYER_CPF_MISMATCH_EXCLUDED",
              message:
                "Ha 3 fatos revisados com CPF divergente do titular cadastrado e eles ficaram fora do resumo anual.",
            },
          ],
        }),
        JSON.stringify({
          documents: 1,
          factsPending: 0,
          factsApproved: 3,
        }),
      ],
    );

    const response = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const payload = JSON.parse(response.text);
    expect(payload.manifest.factsIncluded).toBe(0);
    expect(payload.summary.sourceCounts).toMatchObject({
      documents: 1,
      factsPending: 0,
      factsApproved: 3,
    });
    expect(payload.summary.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TAXPAYER_CPF_MISMATCH_EXCLUDED",
        }),
      ]),
    );
    expect(payload.facts).toEqual([]);
  });

  it("GET /tax/export/:taxYear baixa dossie JSON oficial com manifesto e facts revisados", async () => {
    const token = await registerAndLogin("tax-export-json@test.dev");
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
          filename: "export-json.csv",
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

    const bulkApproveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(bulkApproveResponse.status).toBe(200);

    const rebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(rebuildResponse.status).toBe(200);

    const exportResponse = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("application/json");
    expect(exportResponse.headers["content-disposition"]).toContain(
      'attachment; filename="dossie-fiscal-2026.json"',
    );
    expect(exportResponse.headers["x-tax-export-data-hash"]).toHaveLength(64);
    expect(exportResponse.headers["x-tax-export-snapshot-version"]).toBe("1");
    expect(exportResponse.headers["x-tax-export-facts-included"]).toBe("3");
    expect(exportResponse.headers["x-tax-export-engine-version"]).toBe("irpf-mvp-v1");

    const payload = JSON.parse(exportResponse.text);

    expect(payload).toMatchObject({
      manifest: {
        taxYear: 2026,
        exerciseYear: 2026,
        calendarYear: 2025,
        summarySnapshotVersion: 1,
        factsIncluded: 3,
        engineVersion: "irpf-mvp-v1",
        dataHash: exportResponse.headers["x-tax-export-data-hash"],
      },
      summary: {
        taxYear: 2026,
        exerciseYear: 2026,
        calendarYear: 2025,
        snapshotVersion: 1,
        annualTaxableIncome: 54321,
        annualExclusiveIncome: 5000,
        annualWithheldTax: 4321.09,
      },
    });
    expect(payload.facts).toEqual([
      expect.objectContaining({
        factId: expect.any(Number),
        factType: "taxable_income",
        reviewStatus: "approved",
        sourceDocumentId: uploadResponse.body.document.id,
      }),
      expect.objectContaining({
        factId: expect.any(Number),
        factType: "withheld_tax",
        reviewStatus: "approved",
        sourceDocumentId: uploadResponse.body.document.id,
      }),
      expect.objectContaining({
        factId: expect.any(Number),
        factType: "exclusive_tax_income",
        reviewStatus: "approved",
        sourceDocumentId: uploadResponse.body.document.id,
      }),
    ]);
  });

  it("GET /tax/export/:taxYear baixa CSV oficial dos facts aprovados ou corrigidos", async () => {
    const token = await registerAndLogin("tax-export-csv@test.dev");
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
          filename: "export-csv.csv",
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

    const bulkApproveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(bulkApproveResponse.status).toBe(200);

    const rebuildResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(rebuildResponse.status).toBe(200);

    const exportResponse = await request(app)
      .get("/tax/export/2026?format=csv")
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain(
      'attachment; filename="dossie-fiscal-2026.csv"',
    );
    expect(exportResponse.text).toContain(
      "factId,factType,category,subcategory,payerName,payerDocument,referencePeriod,amount,currency,reviewStatus,sourceDocumentId",
    );
    expect(exportResponse.text).toContain("taxable_income");
    expect(exportResponse.text).toContain("withheld_tax");
    expect(exportResponse.text).toContain("approved");
    expect(exportResponse.text).toContain(String(uploadResponse.body.document.id));
  });
});
