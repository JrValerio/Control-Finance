import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

const OPS_TOKEN_TEST = "ops-token-test";
const TEST_TAX_STORAGE_DIR = path.join(
  os.tmpdir(),
  "control-finance-tax-legacy-reprocess-tests",
);

const INSS_ANNUAL_CONTENT = [
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
].join("\n");

let previousNodeEnv;
let previousOpsToken;
let previousTaxStorageDir;

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
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

const uploadInssAnnualDocument = async (token, filename = "inss-anual.csv") =>
  request(app)
    .post("/tax/documents")
    .set("Authorization", `Bearer ${token}`)
    .field("taxYear", "2026")
    .attach("file", Buffer.from(INSS_ANNUAL_CONTENT, "utf8"), {
      filename,
      contentType: "text/csv",
    });

describe("ops tax legacy reprocess", () => {
  beforeAll(async () => {
    previousNodeEnv = process.env.NODE_ENV;
    previousOpsToken = process.env.OPS_TOKEN;
    previousTaxStorageDir = process.env.TAX_DOCUMENTS_STORAGE_DIR;
    process.env.NODE_ENV = "test";
    process.env.OPS_TOKEN = OPS_TOKEN_TEST;
    process.env.TAX_DOCUMENTS_STORAGE_DIR = TEST_TAX_STORAGE_DIR;
    await setupTestDb();
  });

  afterAll(async () => {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.OPS_TOKEN = previousOpsToken;

    if (typeof previousTaxStorageDir === "undefined") {
      delete process.env.TAX_DOCUMENTS_STORAGE_DIR;
    } else {
      process.env.TAX_DOCUMENTS_STORAGE_DIR = previousTaxStorageDir;
    }

    await removeTaxStorageDir();
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.OPS_TOKEN = OPS_TOKEN_TEST;
    process.env.TAX_DOCUMENTS_STORAGE_DIR = TEST_TAX_STORAGE_DIR;
    await resetState();
  });

  it("POST /ops/tax-documents/reprocess-legacy retorna 401 sem x-ops-token", async () => {
    const response = await request(app)
      .post("/ops/tax-documents/reprocess-legacy")
      .send({ dryRun: true });

    expectErrorResponseWithRequestId(response, 401, "Ops token ausente ou invalido.");
  });

  it("dry-run reprocessa em memoria, nao persiste e reporta exclusao por CPF divergente", async () => {
    const email = "ops-tax-reprocess-dry-run@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    const uploadResponse = await uploadInssAnnualDocument(token, "inss-legacy-dry-run.csv");

    expect(uploadResponse.status).toBe(201);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, '52998224725')`,
      [userId],
    );

    const response = await request(app)
      .post("/ops/tax-documents/reprocess-legacy")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        dryRun: true,
        userId,
        taxYear: 2026,
        limit: 10,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dryRun: true,
      processed: 1,
      succeeded: 1,
      failed: 0,
      updatedExtractions: 0,
      updatedTaxFacts: 0,
      totalFactsGenerated: 5,
      excludedByCpfMismatch: 5,
      summariesRebuilt: 0,
      nextAfterDocumentId: uploadResponse.body.document.id,
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        documentId: uploadResponse.body.document.id,
        userId,
        taxYear: 2026,
        documentTypeBefore: "unknown",
        documentTypeAfter: "income_report_inss",
        statusBefore: "uploaded",
        statusAfter: "normalized",
        factsGenerated: 5,
        officialEligibleFacts: 0,
        excludedByCpfMismatch: 5,
        dryRun: true,
      }),
    ]);

    const extractionCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_document_extractions`,
    );
    const factsCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_facts`,
    );
    const summariesCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_summaries`,
    );
    const documentStatusResult = await dbQuery(
      `SELECT processing_status
       FROM tax_documents
       WHERE id = $1`,
      [uploadResponse.body.document.id],
    );

    expect(Number(extractionCountResult.rows[0].total)).toBe(0);
    expect(Number(factsCountResult.rows[0].total)).toBe(0);
    expect(Number(summariesCountResult.rows[0].total)).toBe(0);
    expect(documentStatusResult.rows[0].processing_status).toBe("uploaded");
  });

  it("apply reprocessa legado, preserva aprovacao e rebuilda o summary", async () => {
    const email = "ops-tax-reprocess-apply@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    await dbQuery(
      `INSERT INTO user_profiles (user_id, taxpayer_cpf)
       VALUES ($1, '43342760400')`,
      [userId],
    );

    const uploadResponse = await uploadInssAnnualDocument(token, "inss-legacy-apply.csv");

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);

    const factIdsResult = await dbQuery(
      `SELECT id
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );
    const factIds = factIdsResult.rows.map((row) => Number(row.id));

    const approveResponse = await request(app)
      .post("/tax/facts/bulk-review")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factIds,
        action: "approve",
      });

    expect(approveResponse.status).toBe(200);

    const initialSummaryResponse = await request(app)
      .post("/tax/summary/2026/rebuild")
      .set("Authorization", `Bearer ${token}`);

    expect(initialSummaryResponse.status).toBe(200);
    expect(initialSummaryResponse.body).toMatchObject({
      snapshotVersion: 1,
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

    const response = await request(app)
      .post("/ops/tax-documents/reprocess-legacy")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        dryRun: false,
        userId,
        taxYear: 2026,
        limit: 10,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dryRun: false,
      processed: 1,
      succeeded: 1,
      failed: 0,
      updatedExtractions: 1,
      updatedTaxFacts: 1,
      totalFactsGenerated: 5,
      excludedByCpfMismatch: 0,
      summariesRebuilt: 1,
      nextAfterDocumentId: uploadResponse.body.document.id,
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        documentId: uploadResponse.body.document.id,
        userId,
        taxYear: 2026,
        documentTypeBefore: "income_report_inss",
        documentTypeAfter: "income_report_inss",
        statusBefore: "normalized",
        statusAfter: "normalized",
        factsGenerated: 5,
        officialEligibleFacts: 5,
        excludedByCpfMismatch: 0,
        dryRun: false,
      }),
    ]);

    const reviewCountsResult = await dbQuery(
      `SELECT review_status, COUNT(*) AS total
       FROM tax_facts
       WHERE source_document_id = $1
       GROUP BY review_status
       ORDER BY review_status ASC`,
      [uploadResponse.body.document.id],
    );
    const extractionsCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_document_extractions
       WHERE document_id = $1`,
      [uploadResponse.body.document.id],
    );
    const summariesCountResult = await dbQuery(
      `SELECT COUNT(*) AS total
       FROM tax_summaries
       WHERE user_id = $1
         AND tax_year = 2026`,
      [userId],
    );

    expect(reviewCountsResult.rows).toEqual([
      {
        review_status: "approved",
        total: 5,
      },
    ]);
    expect(Number(extractionsCountResult.rows[0].total)).toBe(2);
    expect(Number(summariesCountResult.rows[0].total)).toBe(2);

    const summaryResponse = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({
      status: "generated",
      snapshotVersion: 2,
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
});
