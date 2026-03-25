import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { expectErrorResponseWithRequestId, registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("categories", () => {
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
    await dbQuery("DELETE FROM users");
  });

  it("GET /categories bloqueia sem token", async () => {
    const response = await request(app).get("/categories");

    expect(response.status).toBe(401);
  });

  it("POST /categories cria categoria e GET /categories lista ordenado por nome", async () => {
    const token = await registerAndLogin("categories@controlfinance.dev");

    const createTransportResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    const createFoodResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "  Alimentacao  ",
      });

    expect(createTransportResponse.status).toBe(201);
    expect(createTransportResponse.body).toMatchObject({
      userId: createTransportResponse.body.userId,
      name: "Transporte",
      normalizedName: "transporte",
      deletedAt: null,
    });
    expect(Number.isInteger(createTransportResponse.body.id)).toBe(true);
    expect(createTransportResponse.body.id).toBeGreaterThan(0);
    expect(Number.isInteger(createTransportResponse.body.userId)).toBe(true);
    expect(typeof createTransportResponse.body.createdAt).toBe("string");

    expect(createFoodResponse.status).toBe(201);
    expect(createFoodResponse.body).toMatchObject({
      userId: createTransportResponse.body.userId,
      name: "Alimentacao",
      normalizedName: "alimentacao",
      deletedAt: null,
    });
    expect(Number.isInteger(createFoodResponse.body.id)).toBe(true);

    const listResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    // System categories are also returned; filter to check only user-created ones
    const userCategories = listResponse.body.filter((c) => !c.system);
    expect(userCategories).toHaveLength(2);
    expect(userCategories.map((c) => c.name)).toEqual(["Alimentacao", "Transporte"]);
    expect(userCategories.map((c) => c.normalizedName)).toEqual(["alimentacao", "transporte"]);
    expect(userCategories.every((c) => c.deletedAt === null)).toBe(true);
    // System categories are present and have system=true
    expect(listResponse.body.some((c) => c.system === true)).toBe(true);
  });

  it("POST /categories bloqueia nome vazio", async () => {
    const token = await registerAndLogin("categories-empty@controlfinance.dev");

    const response = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "   ",
      });

    expectErrorResponseWithRequestId(response, 400, "Nome da categoria e obrigatorio.");
  });

  it("POST /categories bloqueia categoria duplicada por usuario (case-insensitive)", async () => {
    const token = await registerAndLogin("categories-duplicate@controlfinance.dev");

    const firstResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const duplicateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "alimentacao",
      });

    expect(firstResponse.status).toBe(201);
    expectErrorResponseWithRequestId(duplicateResponse, 409, "Categoria ja existe.");
  });

  it("POST /categories bloqueia categoria duplicada por usuario (acento-insensitive)", async () => {
    const token = await registerAndLogin("categories-duplicate-accent@controlfinance.dev");

    const firstResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Caf\u00e9",
      });

    const duplicateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "cafe",
      });

    expect(firstResponse.status).toBe(201);
    expectErrorResponseWithRequestId(duplicateResponse, 409, "Categoria ja existe.");
  });

  it("GET /categories isola categorias por usuario", async () => {
    const tokenUserA = await registerAndLogin("categories-user-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("categories-user-b@controlfinance.dev");

    await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Lazer",
      });

    await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        name: "Transporte",
      });

    const listUserAResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`);

    const listUserBResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(listUserAResponse.status).toBe(200);
    const userAOwn = listUserAResponse.body.filter((c) => !c.system);
    expect(userAOwn).toHaveLength(1);
    expect(userAOwn[0].name).toBe("Lazer");

    expect(listUserBResponse.status).toBe(200);
    const userBOwn = listUserBResponse.body.filter((c) => !c.system);
    expect(userBOwn).toHaveLength(1);
    expect(userBOwn[0].name).toBe("Transporte");
  });

  it("PATCH /categories/:id renomeia categoria ativa", async () => {
    const token = await registerAndLogin("categories-update@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const updateResponse = await request(app)
      .patch(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "  Mercado   geral  ",
      });

    expect(createResponse.status).toBe(201);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: createResponse.body.id,
      userId: createResponse.body.userId,
      name: "Mercado geral",
      normalizedName: "mercado geral",
      deletedAt: null,
    });
  });

  it("DELETE /categories/:id aplica soft delete, lista includeDeleted e permite recriar", async () => {
    const token = await registerAndLogin("categories-delete@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deleteResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const listActiveResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    const recreateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const listWithDeletedResponse = await request(app)
      .get("/categories")
      .query({ includeDeleted: "true" })
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.deletedAt).toBeTruthy();
    expect(listActiveResponse.status).toBe(200);
    // After soft-delete, user's own categories are empty (system categories still present)
    expect(listActiveResponse.body.filter((c) => !c.system)).toEqual([]);

    expect(recreateResponse.status).toBe(201);
    expect(recreateResponse.body.name).toBe("Mercado");
    expect(recreateResponse.body.deletedAt).toBeNull();
    expect(recreateResponse.body.id).not.toBe(createResponse.body.id);

    expect(listWithDeletedResponse.status).toBe(200);
    const userRows = listWithDeletedResponse.body.filter((c) => !c.system);
    expect(userRows).toHaveLength(2);
    expect(userRows[0].id).toBe(recreateResponse.body.id);
    expect(userRows[0].deletedAt).toBeNull();
    expect(userRows[1].id).toBe(createResponse.body.id);
    expect(userRows[1].deletedAt).toBeTruthy();
  });

  it("POST /categories/:id/restore restaura categoria sem conflito", async () => {
    const token = await registerAndLogin("categories-restore@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    const deleteResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const restoreResponse = await request(app)
      .post(`/categories/${createResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body).toMatchObject({
      id: createResponse.body.id,
      name: "Transporte",
      normalizedName: "transporte",
      deletedAt: null,
    });
  });

  it("POST /categories/:id/restore retorna 409 quando existe conflito de nome ativo", async () => {
    const token = await registerAndLogin("categories-restore-conflict@controlfinance.dev");

    const originalResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deleteOriginalResponse = await request(app)
      .delete(`/categories/${originalResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const recreateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const restoreResponse = await request(app)
      .post(`/categories/${originalResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(originalResponse.status).toBe(201);
    expect(deleteOriginalResponse.status).toBe(200);
    expect(recreateResponse.status).toBe(201);
    expectErrorResponseWithRequestId(restoreResponse, 409, "Categoria ja existe.");
  });

  it("PATCH/DELETE/RESTORE /categories/:id respeitam ownership por usuario", async () => {
    const tokenUserA = await registerAndLogin("categories-owner-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("categories-owner-b@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Saude",
      });

    const patchByOtherUserResponse = await request(app)
      .patch(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        name: "Saude nova",
      });

    const deleteByOtherUserResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    const deleteOwnerResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserA}`);

    const restoreByOtherUserResponse = await request(app)
      .post(`/categories/${createResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(createResponse.status).toBe(201);
    expectErrorResponseWithRequestId(patchByOtherUserResponse, 404, "Categoria nao encontrada.");
    expectErrorResponseWithRequestId(deleteByOtherUserResponse, 404, "Categoria nao encontrada.");
    expect(deleteOwnerResponse.status).toBe(200);
    expectErrorResponseWithRequestId(restoreByOtherUserResponse, 404, "Categoria nao encontrada.");
  });

  it("aplica rate limit por usuario em endpoints de escrita", async () => {
    const token = await registerAndLogin("categories-write-rate-limit@controlfinance.dev");

    for (let index = 0; index < 60; index += 1) {
      const createResponse = await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: `Categoria limite ${index + 1}`,
        });

      expect(createResponse.status).toBe(201);
    }

    const limitedResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Categoria limite 61",
      });

    expectErrorResponseWithRequestId(
      limitedResponse,
      429,
      "Muitas requisicoes. Tente novamente em instantes.",
    );
  });
});
