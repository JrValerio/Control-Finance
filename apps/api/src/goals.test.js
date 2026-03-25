import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  expectErrorResponseWithRequestId,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { calcMonthlyNeeded } from "./services/goals.service.js";

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM user_goals");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

const BASE_GOAL = {
  title: "Viagem Japão",
  target_amount: 15000,
  current_amount: 1000,
  target_date: "2027-10-01",
  icon: "plane",
};

// ─── Unit tests: calcMonthlyNeeded ───────────────────────────────────────────

describe("calcMonthlyNeeded", () => {
  const NOW = new Date("2026-03-25T12:00:00Z");

  it("retorna zero quando meta ja foi atingida", () => {
    expect(calcMonthlyNeeded(1000, 1000, "2026-06-01", NOW)).toBe(0);
  });

  it("retorna zero quando current supera target", () => {
    expect(calcMonthlyNeeded(1000, 1200, "2026-06-01", NOW)).toBe(0);
  });

  it("retorna remaining quando data ja passou (0 meses)", () => {
    // target_date in the past: months = 0 → returns full remaining
    expect(calcMonthlyNeeded(1000, 0, "2026-02-01", NOW)).toBe(1000);
  });

  it("divide remaining pelo numero de meses corretamente", () => {
    // NOW = 2026-03-25; target = 2026-09-01 → 6 meses; remaining = 1200
    const result = calcMonthlyNeeded(1200, 0, "2026-09-01", NOW);
    expect(result).toBe(200); // 1200 / 6
  });

  it("arredonda em duas casas decimais", () => {
    // remaining = 100; months = 3 → 33.33
    const result = calcMonthlyNeeded(100, 0, "2026-06-01", NOW);
    expect(result).toBe(33.33);
  });
});

// ─── HTTP endpoint tests ──────────────────────────────────────────────────────

describe("Goals API", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("GET /goals — retorna 401 sem token", async () => {
    const res = await request(app).get("/goals");
    expectErrorResponseWithRequestId(res, 401, "Token de autenticacao ausente ou invalido.");
  });

  it("POST /goals — retorna 401 sem token", async () => {
    const res = await request(app).post("/goals").send(BASE_GOAL);
    expectErrorResponseWithRequestId(res, 401, "Token de autenticacao ausente ou invalido.");
  });

  // ── List ──────────────────────────────────────────────────────────────────

  it("GET /goals — retorna lista vazia quando sem metas", async () => {
    const token = await registerAndLogin("goals-list-empty@test.dev");

    const res = await request(app)
      .get("/goals")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /goals — retorna apenas metas do usuario autenticado", async () => {
    const token1 = await registerAndLogin("goals-isolation-a@test.dev");
    const token2 = await registerAndLogin("goals-isolation-b@test.dev");

    await request(app).post("/goals").set("Authorization", `Bearer ${token1}`).send(BASE_GOAL);

    const res = await request(app)
      .get("/goals")
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  // ── Create ────────────────────────────────────────────────────────────────

  it("POST /goals — cria meta com campos validos", async () => {
    const token = await registerAndLogin("goals-create@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(BASE_GOAL);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Viagem Japão",
      targetAmount: 15000,
      currentAmount: 1000,
      targetDate: "2027-10-01",
      icon: "plane",
    });
    expect(typeof res.body.monthlyNeeded).toBe("number");
    expect(res.body.monthlyNeeded).toBeGreaterThan(0);
  });

  it("POST /goals — cria meta sem current_amount (default 0)", async () => {
    const token = await registerAndLogin("goals-create-noamt@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Reserva", target_amount: 5000, target_date: "2026-12-01" });

    expect(res.status).toBe(201);
    expect(res.body.currentAmount).toBe(0);
    expect(res.body.icon).toBe("target");
  });

  it("POST /goals — retorna 400 quando title e vazio", async () => {
    const token = await registerAndLogin("goals-val-title@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...BASE_GOAL, title: "" });

    expect(res.status).toBe(400);
  });

  it("POST /goals — retorna 400 quando target_amount e zero", async () => {
    const token = await registerAndLogin("goals-val-target@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...BASE_GOAL, target_amount: 0 });

    expect(res.status).toBe(400);
  });

  it("POST /goals — retorna 400 quando current_amount supera target_amount", async () => {
    const token = await registerAndLogin("goals-val-current@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...BASE_GOAL, current_amount: 20000 });

    expect(res.status).toBe(400);
  });

  it("POST /goals — retorna 400 quando target_date e invalido", async () => {
    const token = await registerAndLogin("goals-val-date@test.dev");

    const res = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...BASE_GOAL, target_date: "nao-e-data" });

    expect(res.status).toBe(400);
  });

  // ── Update ────────────────────────────────────────────────────────────────

  it("PATCH /goals/:id — atualiza campos parcialmente", async () => {
    const token = await registerAndLogin("goals-update@test.dev");

    const created = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(BASE_GOAL);

    const res = await request(app)
      .patch(`/goals/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ current_amount: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.currentAmount).toBe(5000);
    expect(res.body.title).toBe("Viagem Japão"); // outros campos mantidos
  });

  it("PATCH /goals/:id — retorna 404 para meta de outro usuario", async () => {
    const tokenA = await registerAndLogin("goals-patch-a@test.dev");
    const tokenB = await registerAndLogin("goals-patch-b@test.dev");

    const created = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(BASE_GOAL);

    const res = await request(app)
      .patch(`/goals/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ current_amount: 5000 });

    expect(res.status).toBe(404);
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it("DELETE /goals/:id — soft-deleta meta e retorna 204", async () => {
    const token = await registerAndLogin("goals-delete@test.dev");

    const created = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(BASE_GOAL);

    const del = await request(app)
      .delete(`/goals/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(del.status).toBe(204);

    const list = await request(app).get("/goals").set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });

  it("DELETE /goals/:id — retorna 404 para meta ja deletada", async () => {
    const token = await registerAndLogin("goals-delete-twice@test.dev");

    const created = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(BASE_GOAL);

    await request(app).delete(`/goals/${created.body.id}`).set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .delete(`/goals/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("DELETE /goals/:id — retorna 404 para meta de outro usuario", async () => {
    const tokenA = await registerAndLogin("goals-del-a@test.dev");
    const tokenB = await registerAndLogin("goals-del-b@test.dev");

    const created = await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(BASE_GOAL);

    const res = await request(app)
      .delete(`/goals/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  // ── monthlyNeeded ─────────────────────────────────────────────────────────

  it("GET /goals — monthlyNeeded e calculado e retornado", async () => {
    const token = await registerAndLogin("goals-monthly@test.dev");

    await request(app)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Meta", target_amount: 1200, current_amount: 0, target_date: "2026-09-01" });

    const res = await request(app).get("/goals").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].monthlyNeeded).toBeGreaterThan(0);
  });
});
