import { createHmac } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { newDb } from "pg-mem";
import app from "./app.js";
import { setDbClientForTests, dbQuery } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";

export const setupTestDb = async () => {
  const inMemoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
  const pgAdapter = inMemoryDatabase.adapters.createPg();
  const pool = new pgAdapter.Pool();
  setDbClientForTests(pool);
  await runMigrations();
  return pool;
};

// Extracts the cf_access JWT from a Set-Cookie header array.
// The JWT can be used as a Bearer token via the middleware's bearer fallback.
export const extractAccessToken = (response) => {
  const cookies = response.headers["set-cookie"] || [];
  const accessCookie = cookies.find((c) => c.startsWith("cf_access="));
  if (!accessCookie) return null;
  return accessCookie.split(";")[0].split("=")[1];
};

export const registerAndLogin = async (email, password = "Senha123") => {
  await request(app).post("/auth/register").send({ email, password });
  const loginResponse = await request(app).post("/auth/login").send({ email, password });
  return extractAccessToken(loginResponse);
};

export const getUserIdByEmail = async (email) => {
  const result = await dbQuery(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  return Number(result.rows[0]?.id);
};

export const expectErrorResponseWithRequestId = (response, expectedStatus, expectedMessage) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toMatchObject({ message: expectedMessage });
  expect(typeof response.body.requestId).toBe("string");
  expect(response.body.requestId.length).toBeGreaterThan(0);
  expect(response.body.requestId.length).toBeLessThanOrEqual(128);
  expect(response.body.requestId).toBe(response.headers["x-request-id"]);
};

export const csvFile = (content, fileName = "import.csv") => ({
  buffer: Buffer.from(content, "utf8"),
  fileName,
});

export const makeProUser = async (email) => {
  const userId = await getUserIdByEmail(email);
  const planResult = await dbQuery(
    `SELECT id FROM plans WHERE name = 'pro' AND is_active = true LIMIT 1`,
  );
  const planId = planResult.rows[0].id;
  await dbQuery(
    `INSERT INTO subscriptions (user_id, plan_id, status) VALUES ($1, $2, 'active')`,
    [userId, planId],
  );
};

export const createTransactionsForUser = async (token, count) => {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "Entrada",
          value: (index + 1) * 10,
          date: `2026-01-${String(index + 1).padStart(2, "0")}`,
          description: `Lancamento ${index + 1}`,
        }),
    ),
  );
};

const addMonthsUtc = (baseDate, monthsToAdd) =>
  new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + monthsToAdd, 1));

export const toMonthValue = (value) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const getExpectedTrendMonths = (months) => {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: months }, (_unused, index) =>
    toMonthValue(addMonthsUtc(currentMonthStart, index - (months - 1))),
  );
};

const AUTH_SECURITY_ENV_KEYS = [
  "AUTH_BRUTE_FORCE_MAX_ATTEMPTS",
  "AUTH_BRUTE_FORCE_WINDOW_MS",
  "AUTH_BRUTE_FORCE_LOCK_MS",
];

export const snapshotAuthSecurityEnv = () => {
  return AUTH_SECURITY_ENV_KEYS.reduce((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {});
};

export const restoreAuthSecurityEnv = (snapshot) => {
  AUTH_SECURITY_ENV_KEYS.forEach((key) => {
    if (typeof snapshot[key] === "undefined") {
      delete process.env[key];
      return;
    }
    process.env[key] = snapshot[key];
  });
};

export const generateStripeSignature = (payload, secret) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { header: `t=${timestamp},v1=${sig}`, body };
};
