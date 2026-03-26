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

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
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
    await setupTestDb();
  });

  afterAll(async () => {
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

  it("GET /tax/documents retorna 400 quando taxYear nao e informado", async () => {
    const token = await registerAndLogin("tax-documents-missing-year@test.dev");
    const response = await request(app)
      .get("/tax/documents")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "taxYear invalido.");
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
