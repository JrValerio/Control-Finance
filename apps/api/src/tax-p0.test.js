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

const TEST_TAX_STORAGE_DIR = path.join(os.tmpdir(), "control-finance-tax-documents-p0-tests");
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
  await dbQuery("DELETE FROM income_statement_deductions");
  await dbQuery("DELETE FROM income_statements");
  await dbQuery("DELETE FROM income_deductions");
  await dbQuery("DELETE FROM income_sources");
  await dbQuery("DELETE FROM salary_consignacoes");
  await dbQuery("DELETE FROM salary_profiles");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM categories");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

const getUserIdByEmail = async (email) => {
  const result = await dbQuery(
    `SELECT id
     FROM users
     WHERE email = $1`,
    [email],
  );

  return Number(result.rows[0]?.id);
};

describe("Tax P0 regressions", () => {
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

  it("mantem o export consistente com o ultimo snapshot mesmo se fatos revisados mudarem depois", async () => {
    const token = await registerAndLogin("tax-export-snapshot-pure@test.dev");
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
          filename: "snapshot-pure.csv",
          contentType: "text/csv",
        },
      );

    expect(uploadResponse.status).toBe(201);

    const reprocessResponse = await request(app)
      .post(`/tax/documents/${uploadResponse.body.document.id}/reprocess`)
      .set("Authorization", `Bearer ${token}`);

    expect(reprocessResponse.status).toBe(200);

    const factsResult = await dbQuery(
      `SELECT id, fact_type
       FROM tax_facts
       WHERE source_document_id = $1
       ORDER BY id ASC`,
      [uploadResponse.body.document.id],
    );
    const factIds = factsResult.rows.map((row) => Number(row.id));
    const taxableFactId = Number(
      factsResult.rows.find((row) => row.fact_type === "taxable_income")?.id,
    );

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
    expect(rebuildResponse.body.snapshotVersion).toBe(1);
    expect(rebuildResponse.body.annualTaxableIncome).toBe(54321);

    const correctionResponse = await request(app)
      .patch(`/tax/facts/${taxableFactId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        action: "correct",
        corrected: {
          amount: 60000,
          subcategory: "annual_taxable_income_adjusted",
        },
      });

    expect(correctionResponse.status).toBe(200);
    expect(correctionResponse.body.fact.amount).toBe(60000);

    const exportResponse = await request(app)
      .get("/tax/export/2026?format=json")
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);

    const payload = JSON.parse(exportResponse.text);
    const exportedTaxableFact = payload.facts.find((fact) => fact.factType === "taxable_income");

    expect(payload.summary.snapshotVersion).toBe(1);
    expect(payload.summary.annualTaxableIncome).toBe(54321);
    expect(payload.manifest.factsIncluded).toBe(3);
    expect(exportedTaxableFact.amount).toBe(54321);
    expect(exportedTaxableFact.subcategory).toBe("annual_taxable_income");
  });

  it("calcula obrigatoriedade com gatilhos de receita rural, ganho de capital e bolsa", async () => {
    const email = "tax-obligation-expanded@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    await dbQuery(
      `INSERT INTO tax_facts (
         user_id,
         tax_year,
         fact_type,
         category,
         subcategory,
         reference_period,
         currency,
         amount,
         metadata_json,
         review_status
       )
       VALUES
       ($1, 2026, 'other', 'income', 'rural_revenue', '2025-annual', 'BRL', 180000, '{}'::jsonb, 'approved'),
       ($1, 2026, 'other', 'income', 'capital_gain', '2025-annual', 'BRL', 1, '{}'::jsonb, 'approved'),
       ($1, 2026, 'other', 'income', 'stock_operation_total', '2025-annual', 'BRL', 50000, '{}'::jsonb, 'approved')`,
      [userId],
    );

    const response = await request(app)
      .get("/tax/obligation/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.mustDeclare).toBe(true);
    expect(response.body.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RURAL_REVENUE_LIMIT" }),
        expect.objectContaining({ code: "CAPITAL_GAIN_EVENT" }),
        expect.objectContaining({ code: "STOCK_OPERATION_EVENT" }),
      ]),
    );
    expect(response.body.thresholds).toMatchObject({
      ruralRevenue: 177920,
      stockOperations: 40000,
    });
    expect(response.body.totals).toMatchObject({
      annualRuralRevenue: 180000,
      totalStockOperations: 50000,
      hasCapitalGain: true,
    });
  });

  it("sincroniza fatos fiscais a partir de income statements e transacoes de renda do app", async () => {
    const email = "tax-app-sync@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    const categoryResult = await dbQuery(
      `INSERT INTO categories (user_id, name, normalized_name, type)
       VALUES ($1, 'Salario', 'salario', 'income')
       RETURNING id`,
      [userId],
    );
    const categoryId = Number(categoryResult.rows[0].id);

    const sourceResult = await dbQuery(
      `INSERT INTO income_sources (user_id, name, category_id)
       VALUES ($1, 'Empresa ABC', $2)
       RETURNING id`,
      [userId, categoryId],
    );
    const sourceId = Number(sourceResult.rows[0].id);

    await dbQuery(
      `INSERT INTO income_statements (
         income_source_id,
         reference_month,
         net_amount,
         total_deductions,
         gross_amount,
         status
       )
       VALUES ($1, '2025-03', 4200, 300, 4500, 'posted')`,
      [sourceId],
    );

    await dbQuery(
      `INSERT INTO transactions (user_id, type, value, date, description, category_id)
       VALUES ($1, 'Entrada', 1300, '2025-04-05', 'Freela Abril', $2)`,
      [userId, categoryId],
    );

    const response = await request(app)
      .post("/tax/app-sync/2026")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      processedStatements: 1,
      processedTransactions: 1,
      totalFactsGenerated: 2,
      summariesRebuilt: 1,
    });

    const factsResult = await dbQuery(
      `SELECT fact_type, subcategory, amount, review_status, source_document_id, metadata_json
       FROM tax_facts
       WHERE user_id = $1
       ORDER BY id ASC`,
      [userId],
    );

    expect(factsResult.rows).toEqual([
      expect.objectContaining({
        fact_type: "taxable_income",
        subcategory: "app_income_statement_taxable_income",
        amount: 4500,
        review_status: "pending",
        source_document_id: null,
      }),
      expect.objectContaining({
        fact_type: "taxable_income",
        subcategory: "app_transaction_income",
        amount: 1300,
        review_status: "pending",
        source_document_id: null,
      }),
    ]);
  });

  it("preserva review_status ao ressincronizar fatos derivados do app e rebuilda o summary", async () => {
    const email = "tax-app-sync-review-preserve@test.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    const categoryResult = await dbQuery(
      `INSERT INTO categories (user_id, name, normalized_name, type)
       VALUES ($1, 'Renda', 'renda', 'income')
       RETURNING id`,
      [userId],
    );
    const categoryId = Number(categoryResult.rows[0].id);

    const sourceResult = await dbQuery(
      `INSERT INTO income_sources (user_id, name, category_id)
       VALUES ($1, 'Cliente XPTO', $2)
       RETURNING id`,
      [userId, categoryId],
    );
    const sourceId = Number(sourceResult.rows[0].id);

    await dbQuery(
      `INSERT INTO income_statements (
         income_source_id,
         reference_month,
         net_amount,
         total_deductions,
         gross_amount,
         status
       )
       VALUES ($1, '2025-06', 2400, 0, 2400, 'posted')`,
      [sourceId],
    );

    const firstSyncResponse = await request(app)
      .post("/tax/app-sync/2026")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(firstSyncResponse.status).toBe(200);

    const syncedFactIdResult = await dbQuery(
      `SELECT id
       FROM tax_facts
       WHERE user_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [userId],
    );
    const syncedFactId = Number(syncedFactIdResult.rows[0].id);

    const approveResponse = await request(app)
      .patch(`/tax/facts/${syncedFactId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        action: "approve",
      });

    expect(approveResponse.status).toBe(200);

    const secondSyncResponse = await request(app)
      .post("/tax/app-sync/2026")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(secondSyncResponse.status).toBe(200);
    expect(secondSyncResponse.body.preservedReviewedFactsCount).toBe(1);
    expect(secondSyncResponse.body.summariesRebuilt).toBe(1);

    const factAfterResyncResult = await dbQuery(
      `SELECT review_status
       FROM tax_facts
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [userId],
    );

    expect(factAfterResyncResult.rows[0].review_status).toBe("approved");

    const summaryResponse = await request(app)
      .get("/tax/summary/2026")
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.status).toBe("generated");
    expect(summaryResponse.body.annualTaxableIncome).toBe(2400);
    expect(summaryResponse.body.sourceCounts.factsApproved).toBe(1);
  });

  it("bloqueia sync do app quando ja existem documentos fiscais no exercicio", async () => {
    const email = "tax-app-sync-with-documents@test.dev";
    const token = await registerAndLogin(email);

    const uploadResponse = await request(app)
      .post("/tax/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("taxYear", "2026")
      .attach("file", Buffer.from("%PDF-1.4\nconflict", "utf8"), {
        filename: "conflict.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);

    const syncResponse = await request(app)
      .post("/tax/app-sync/2026")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(
      syncResponse,
      409,
      "Ja existem documentos fiscais neste exercicio. A importacao do app foi bloqueada para evitar mistura com a trilha documental.",
    );
    expect(syncResponse.body.code).toBe("TAX_APP_SYNC_DOCUMENT_CONFLICT");
  });
});
