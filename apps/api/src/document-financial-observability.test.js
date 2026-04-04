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
import { csvFile, makeProUser, registerAndLogin, setupTestDb } from "./test-helpers.js";

const getObservabilityCounterValue = (metricsText, { source, signal, reasonClass }) => {
  const expression = new RegExp(
    `document_financial_observability_events_total\\{[^}]*source="${source}"[^}]*signal="${signal}"[^}]*reason_class="${reasonClass}"[^}]*\\}\\s+([0-9.]+)`,
  );

  const match = metricsText.match(expression);

  if (!match) {
    return 0;
  }

  return Number(match[1] || 0);
};

describe("document financial observability", () => {
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
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM transaction_import_sessions");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("tracks parse attempt and parse failure with controlled reason class", async () => {
    const email = "doc-observability-parse-failure@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const invalidHeaderCsv = csvFile("tipo,valor,descricao\nSaida,100,Mercado");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidHeaderCsv.buffer, {
        filename: invalidHeaderCsv.fileName,
        contentType: "text/csv",
      });

    const metricsResponse = await request(app).get("/metrics");

    expect(response.status).toBe(400);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain("# HELP document_financial_observability_events_total");
    expect(
      getObservabilityCounterValue(metricsResponse.text, {
        source: "transactions_import",
        signal: "parse_attempt",
        reasonClass: "none",
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      getObservabilityCounterValue(metricsResponse.text, {
        source: "transactions_import",
        signal: "parse_failure",
        reasonClass: "validation",
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("tracks sensitive financial mutation success after import commit", async () => {
    const email = "doc-observability-mutation-success@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);
    const validCsv = csvFile("date,type,value,description\n2026-03-01,Entrada,500,Teste observabilidade");

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", validCsv.buffer, {
        filename: validCsv.fileName,
        contentType: "text/csv",
      });

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryRunResponse.body.importId });

    const metricsResponse = await request(app).get("/metrics");

    expect(dryRunResponse.status).toBe(200);
    expect(commitResponse.status).toBe(200);
    expect(metricsResponse.status).toBe(200);
    expect(
      getObservabilityCounterValue(metricsResponse.text, {
        source: "transactions_import",
        signal: "sensitive_mutation_success",
        reasonClass: "none",
      }),
    ).toBeGreaterThanOrEqual(1);
  });
});