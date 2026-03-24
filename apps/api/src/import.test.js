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
import {
  csvFile,
  expectErrorResponseWithRequestId,
  getUserIdByEmail,
  makeProUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("transaction imports", () => {
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
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /transactions/imports bloqueia sem token", async () => {
    const response = await request(app).get("/transactions/imports");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/imports/metrics bloqueia sem token e retorna requestId", async () => {
    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("x-request-id", "rid-123");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: "Token de autenticacao ausente ou invalido.",
      requestId: "rid-123",
    });
    expect(response.headers["x-request-id"]).toBe("rid-123");
  });

  it("GET /transactions/imports/metrics retorna zeros quando usuario nao possui sessoes", async () => {
    const token = await registerAndLogin("imports-metrics-empty@controlfinance.dev");
    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 0,
      last30Days: 0,
      lastImportAt: null,
    });
  });

  it("GET /transactions/imports/metrics retorna total, last30Days e lastImportAt por usuario", async () => {
    const userAEmail = "imports-metrics-user-a@controlfinance.dev";
    const userBEmail = "imports-metrics-user-b@controlfinance.dev";
    const tokenUserA = await registerAndLogin(userAEmail);
    await registerAndLogin(userBEmail);

    const userAId = await getUserIdByEmail(userAEmail);
    const userBId = await getUserIdByEmail(userBEmail);
    const recentCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldCreatedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const otherUserCreatedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    await dbQuery(
      `
        INSERT INTO transaction_import_sessions (
          id,
          user_id,
          payload_json,
          created_at,
          expires_at,
          committed_at
        )
        VALUES
          ($1, $2, $3::jsonb, $4, $5, $6),
          ($7, $8, $9::jsonb, $10, $11, $12),
          ($13, $14, $15::jsonb, $16, $17, $18)
      `,
      [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        userAId,
        JSON.stringify({ summary: { totalRows: 2, validRows: 2, invalidRows: 0 } }),
        recentCreatedAt,
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        null,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
        userAId,
        JSON.stringify({ summary: { totalRows: 1, validRows: 1, invalidRows: 0 } }),
        oldCreatedAt,
        new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        null,
        "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
        userBId,
        JSON.stringify({ summary: { totalRows: 5, validRows: 4, invalidRows: 1 } }),
        otherUserCreatedAt,
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        null,
      ],
    );

    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.last30Days).toBe(1);
    expect(response.body.lastImportAt).toBe(recentCreatedAt);
  });

  it.each([
    { limit: "0" },
    { limit: "101" },
    { limit: "abc" },
    { offset: "-1" },
    { offset: "abc" },
    { limit: "10.5" },
  ])("GET /transactions/imports retorna 400 para paginacao invalida (%o)", async (query) => {
    const token = await registerAndLogin("imports-paginacao@controlfinance.dev");
    const response = await request(app)
      .get("/transactions/imports")
      .query(query)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Paginacao invalida.");
  });

  it("GET /transactions/imports lista sessoes por usuario com ordem desc e shape consistente", async () => {
    const userAEmail = "imports-list-user-a@controlfinance.dev";
    const userBEmail = "imports-list-user-b@controlfinance.dev";
    const tokenUserA = await registerAndLogin(userAEmail);
    await registerAndLogin(userBEmail);

    const userAId = await getUserIdByEmail(userAEmail);
    const userBId = await getUserIdByEmail(userBEmail);

    const olderImportId = "11111111-1111-4111-8111-111111111111";
    const newerImportId = "22222222-2222-4222-8222-222222222222";
    const otherUserImportId = "33333333-3333-4333-8333-333333333333";

    await dbQuery(
      `
        INSERT INTO transaction_import_sessions (
          id,
          user_id,
          payload_json,
          created_at,
          expires_at,
          committed_at
        )
        VALUES
          ($1, $2, $3::jsonb, $4, $5, $6),
          ($7, $8, $9::jsonb, $10, $11, $12),
          ($13, $14, $15::jsonb, $16, $17, $18)
      `,
      [
        olderImportId,
        userAId,
        JSON.stringify({
          summary: {
            totalRows: 4,
            validRows: 3,
            invalidRows: 1,
            income: 1000,
            expense: 150.5,
          },
        }),
        "2026-04-01T09:00:00.000Z",
        "2026-04-01T09:30:00.000Z",
        null,
        newerImportId,
        userAId,
        JSON.stringify({
          summary: {
            totalRows: 2,
            validRows: 2,
            invalidRows: 0,
            income: 700,
            expense: 220.25,
          },
        }),
        "2026-04-01T10:00:00.000Z",
        "2026-04-01T10:30:00.000Z",
        "2026-04-01T10:10:00.000Z",
        otherUserImportId,
        userBId,
        JSON.stringify({
          summary: {
            totalRows: 1,
            validRows: 1,
            invalidRows: 0,
            income: 50,
            expense: 0,
          },
        }),
        "2026-04-01T11:00:00.000Z",
        "2026-04-01T11:30:00.000Z",
        null,
      ],
    );

    const response = await request(app)
      .get("/transactions/imports")
      .query({
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      limit: 20,
      offset: 0,
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item) => item.id)).toEqual([
      newerImportId,
      olderImportId,
    ]);

    expect(response.body.items[0]).toEqual({
      id: newerImportId,
      createdAt: "2026-04-01T10:00:00.000Z",
      expiresAt: "2026-04-01T10:30:00.000Z",
      committedAt: "2026-04-01T10:10:00.000Z",
      summary: {
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
        income: 700,
        expense: 220.25,
        imported: 2,
      },
    });
    expect(response.body.items[1]).toEqual({
      id: olderImportId,
      createdAt: "2026-04-01T09:00:00.000Z",
      expiresAt: "2026-04-01T09:30:00.000Z",
      committedAt: null,
      summary: {
        totalRows: 4,
        validRows: 3,
        invalidRows: 1,
        income: 1000,
        expense: 150.5,
        imported: 0,
      },
    });

    const pagedResponse = await request(app)
      .get("/transactions/imports")
      .query({
        limit: 1,
        offset: 1,
      })
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(pagedResponse.status).toBe(200);
    expect(pagedResponse.body.items).toHaveLength(1);
    expect(pagedResponse.body.items[0].id).toBe(olderImportId);
    expect(pagedResponse.body.items.map((item) => item.id)).not.toContain(otherUserImportId);
  });

  it("POST /transactions/import/dry-run bloqueia sem token", async () => {
    const response = await request(app)
      .post("/transactions/import/dry-run")
      .attach("file", csvFile("date,type,value,description\n2026-02-01,Entrada,100,Teste").buffer, {
        filename: "import.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(401);
  });

  it("POST /transactions/import/dry-run retorna 400 sem arquivo", async () => {
    const token = await registerAndLogin("import-sem-arquivo@controlfinance.dev");
    await makeProUser("import-sem-arquivo@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Arquivo do extrato (file) e obrigatorio.");
  });

  it("POST /transactions/import/dry-run retorna 400 para arquivo sem formato suportado", async () => {
    const token = await registerAndLogin("import-arquivo-invalido@controlfinance.dev");
    await makeProUser("import-arquivo-invalido@controlfinance.dev");
    const invalidFile = csvFile("conteudo sem cabecalho", "import.txt");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidFile.buffer, {
        filename: invalidFile.fileName,
        contentType: "text/plain",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Arquivo invalido. Envie um CSV, OFX ou PDF de extrato.",
    );
  });

  it("POST /transactions/import/dry-run retorna 413 quando arquivo excede limite", async () => {
    const token = await registerAndLogin("import-arquivo-grande@controlfinance.dev");
    await makeProUser("import-arquivo-grande@controlfinance.dev");
    const oversizedContent = `date,type,value,description\n${"a".repeat(2 * 1024 * 1024 + 1)}`;
    const oversizedCsvFile = csvFile(oversizedContent, "oversized.csv");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", oversizedCsvFile.buffer, {
        filename: oversizedCsvFile.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(response, 413, "Arquivo muito grande.");
  });

  it("POST /transactions/import/dry-run retorna 400 quando CSV excede o limite de linhas", async () => {
    const token = await registerAndLogin("import-linhas-maximo@controlfinance.dev");
    await makeProUser("import-linhas-maximo@controlfinance.dev");
    const rows = ["date,type,value,description"];

    for (let lineNumber = 1; lineNumber <= 2001; lineNumber += 1) {
      rows.push(`2026-03-01,Entrada,1,Linha ${lineNumber}`);
    }

    const oversizedRowsCsv = csvFile(rows.join("\n"));

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", oversizedRowsCsv.buffer, {
        filename: oversizedRowsCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(response, 400, "CSV excede o limite de 2000 linhas.");
  });

  it("POST /transactions/import/dry-run retorna 429 quando excede o limite de requisicoes", async () => {
    const token = await registerAndLogin("import-rate-limit@controlfinance.dev");
    await makeProUser("import-rate-limit@controlfinance.dev");
    const validCsv = csvFile("date,type,value,description\n2026-03-01,Entrada,100,Teste");

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const allowedResponse = await request(app)
        .post("/transactions/import/dry-run")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", validCsv.buffer, {
          filename: validCsv.fileName,
          contentType: "text/csv",
        });

      expect(allowedResponse.status).toBe(200);
    }

    const throttledResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", validCsv.buffer, {
        filename: validCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(
      throttledResponse,
      429,
      "Muitas requisicoes. Tente novamente em instantes.",
    );
  });

  it("POST /transactions/import/dry-run retorna 400 para arquivo nao reconhecido", async () => {
    const token = await registerAndLogin("import-cabecalho@controlfinance.dev");
    await makeProUser("import-cabecalho@controlfinance.dev");
    const invalidHeaderCsv = csvFile("tipo,valor,descricao\nSaida,100,Mercado");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidHeaderCsv.buffer, {
        filename: invalidHeaderCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Arquivo nao reconhecido. Envie um CSV manual com cabecalho date,type,value,description,notes,category ou um CSV, OFX ou PDF de extrato.",
    );
  });

  it("POST /transactions/import/dry-run aceita OFX como formato preferencial de extrato", async () => {
    const token = await registerAndLogin("import-bank-ofx@controlfinance.dev");
    await makeProUser("import-bank-ofx@controlfinance.dev");
    const ofxFile = csvFile(
      [
        "OFXHEADER:100",
        "DATA:OFXSGML",
        "<OFX>",
        "<BANKTRANLIST>",
        "<STMTTRN>",
        "<TRNTYPE>CREDIT",
        "<DTPOSTED>20260205000000[-3:BRT]",
        "<TRNAMT>2812.99",
        "<FITID>ABC123",
        "<MEMO>PGTO INSS 01776829899",
        "</STMTTRN>",
        "<STMTTRN>",
        "<TRNTYPE>DEBIT",
        "<DTPOSTED>20260206000000[-3:BRT]",
        "<TRNAMT>-15.98",
        "<FITID>XYZ456",
        "<NAME>PIX QRS UBER DO BRA",
        "</STMTTRN>",
      ].join("\n"),
      "itau-extrato.ofx",
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", ofxFile.buffer, {
        filename: ofxFile.fileName,
        contentType: "application/ofx",
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      income: 2812.99,
      expense: 15.98,
    });
    expect(response.body.rows[0].raw.description).toBe("PGTO INSS 01776829899");
    expect(response.body.rows[1].raw.description).toBe("PIX QRS UBER DO BRA");
  });

  it("POST /transactions/import/dry-run aceita CSV de extrato bancario com colunas flexiveis", async () => {
    const token = await registerAndLogin("import-bank-csv@controlfinance.dev");
    await makeProUser("import-bank-csv@controlfinance.dev");
    const statementCsv = csvFile(
      [
        "Data;Historico;Valor",
        "05/02/2026;PGTO INSS 01776829899;2812,99",
        "05/02/2026;SALDO DO DIA;2411,37",
        "06/02/2026;PIX QRS UBER DO BRA;-15,98",
      ].join("\n"),
      "itau-extrato.csv",
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", statementCsv.buffer, {
        filename: statementCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      income: 2812.99,
      expense: 15.98,
    });
    expect(response.body.rows).toEqual([
      {
        line: 2,
        status: "valid",
        raw: {
          date: "2026-02-05",
          type: "Entrada",
          value: "2812.99",
          description: "PGTO INSS 01776829899",
          notes: "",
          category: "",
        },
        normalized: {
          date: "2026-02-05",
          type: "Entrada",
          value: 2812.99,
          description: "PGTO INSS 01776829899",
          notes: "",
          categoryId: null,
        },
        errors: [],
      },
      {
        line: 4,
        status: "valid",
        raw: {
          date: "2026-02-06",
          type: "Saida",
          value: "15.98",
          description: "PIX QRS UBER DO BRA",
          notes: "",
          category: "",
        },
        normalized: {
          date: "2026-02-06",
          type: "Saida",
          value: 15.98,
          description: "PIX QRS UBER DO BRA",
          notes: "",
          categoryId: null,
        },
        errors: [],
      },
    ]);
  });

  it("POST /transactions/import/dry-run auto-classifica extrato usando categorias existentes", async () => {
    const token = await registerAndLogin("import-bank-smart-category@controlfinance.dev");
    await makeProUser("import-bank-smart-category@controlfinance.dev");

    const benefitsCategory = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Beneficios" });

    const transportCategory = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Transporte" });

    const statementCsv = csvFile(
      [
        "Data;Historico;Valor",
        "05/02/2026;PGTO INSS 01776829899;2812,99",
        "06/02/2026;PIX QRS UBER DO BRA;-15,98",
      ].join("\n"),
      "itau-extrato.csv",
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", statementCsv.buffer, {
        filename: statementCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.rows[0].raw.category).toBe("Beneficios");
    expect(response.body.rows[0].normalized.categoryId).toBe(benefitsCategory.body.id);
    expect(response.body.rows[1].raw.category).toBe("Transporte");
    expect(response.body.rows[1].normalized.categoryId).toBe(transportCategory.body.id);
  });

  it("POST /transactions/import/dry-run valida linhas e persiste sessao", async () => {
    const token = await registerAndLogin("import-sessao@controlfinance.dev");
    await makeProUser("import-sessao@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const mixedCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-02-01,Entrada,1000,Salario,,",
        "2026-02-10,Saida,220.50,Mercado,,alimentacao",
        "2026-02-11,Saida,0,Cafe,,Alimentacao",
        "2026-02-12,Saida,30,,Lanche,Transporte",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", mixedCsv.buffer, {
        filename: mixedCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(typeof response.body.importId).toBe("string");
    expect(response.body.importId.length).toBeGreaterThan(10);
    expect(typeof response.body.expiresAt).toBe("string");
    expect(response.body.summary).toEqual({
      totalRows: 4,
      validRows: 2,
      invalidRows: 2,
      income: 1000,
      expense: 220.5,
    });
    expect(response.body.rows).toEqual([
      {
        line: 2,
        status: "valid",
        raw: {
          date: "2026-02-01",
          type: "Entrada",
          value: "1000",
          description: "Salario",
          notes: "",
          category: "",
        },
        normalized: {
          date: "2026-02-01",
          type: "Entrada",
          value: 1000,
          description: "Salario",
          notes: "",
          categoryId: null,
        },
        errors: [],
      },
      {
        line: 3,
        status: "valid",
        raw: {
          date: "2026-02-10",
          type: "Saida",
          value: "220.50",
          description: "Mercado",
          notes: "",
          category: "alimentacao",
        },
        normalized: {
          date: "2026-02-10",
          type: "Saida",
          value: 220.5,
          description: "Mercado",
          notes: "",
          categoryId: categoryResponse.body.id,
        },
        errors: [],
      },
      {
        line: 4,
        status: "invalid",
        raw: {
          date: "2026-02-11",
          type: "Saida",
          value: "0",
          description: "Cafe",
          notes: "",
          category: "Alimentacao",
        },
        normalized: null,
        errors: [{ field: "value", message: "Valor invalido. Informe um numero maior que zero." }],
      },
      {
        line: 5,
        status: "invalid",
        raw: {
          date: "2026-02-12",
          type: "Saida",
          value: "30",
          description: "",
          notes: "Lanche",
          category: "Transporte",
        },
        normalized: null,
        errors: [
          { field: "description", message: "Descricao e obrigatoria." },
          { field: "category", message: "Categoria nao encontrada." },
        ],
      },
    ]);

    const persistedSessionResult = await dbQuery(
      `
        SELECT id, user_id, payload_json, committed_at, expires_at
        FROM transaction_import_sessions
        WHERE id = $1
      `,
      [response.body.importId],
    );
    const persistedSession = persistedSessionResult.rows[0];

    expect(persistedSession.id).toBe(response.body.importId);
    expect(Number(persistedSession.user_id)).toBeGreaterThan(0);
    expect(persistedSession.committed_at).toBeNull();
    expect(new Date(persistedSession.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(Array.isArray(persistedSession.payload_json.normalizedRows)).toBe(true);
    expect(persistedSession.payload_json.normalizedRows).toHaveLength(2);
  });

  it("POST /transactions/import/dry-run marca date e type invalidos por linha", async () => {
    const token = await registerAndLogin("import-date-type@controlfinance.dev");
    await makeProUser("import-date-type@controlfinance.dev");
    const invalidCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-02-31,Saida,10,Cafe,,",
        "2026-02-20,Transferencia,20,Pix,,",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidCsv.buffer, {
        filename: invalidCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRows: 2,
      validRows: 0,
      invalidRows: 2,
      income: 0,
      expense: 0,
    });
    expect(response.body.rows[0]).toMatchObject({
      line: 2,
      status: "invalid",
      errors: [{ field: "date", message: "Data invalida. Use YYYY-MM-DD." }],
    });
    expect(response.body.rows[1]).toMatchObject({
      line: 3,
      status: "invalid",
      errors: [{ field: "type", message: "Tipo invalido. Use Entrada ou Saida." }],
    });
  });

  it("POST /transactions/import/commit bloqueia sem token", async () => {
    const response = await request(app).post("/transactions/import/commit").send({
      importId: "11111111-1111-4111-8111-111111111111",
    });

    expect(response.status).toBe(401);
  });

  it("POST /transactions/import/commit retorna 429 quando excede o limite de requisicoes", async () => {
    const token = await registerAndLogin("import-commit-rate-limit@controlfinance.dev");
    await makeProUser("import-commit-rate-limit@controlfinance.dev");
    const invalidPayload = { importId: "abc" };

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const allowedResponse = await request(app)
        .post("/transactions/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send(invalidPayload);

      expectErrorResponseWithRequestId(allowedResponse, 400, "importId invalido.");
    }

    const throttledResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send(invalidPayload);

    expectErrorResponseWithRequestId(
      throttledResponse,
      429,
      "Muitas requisicoes. Tente novamente em instantes.",
    );
  });

  it("POST /transactions/import/commit retorna 400 sem importId", async () => {
    const token = await registerAndLogin("import-commit-sem-id@controlfinance.dev");
    await makeProUser("import-commit-sem-id@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(response, 400, "importId e obrigatorio.");
  });

  it("POST /transactions/import/commit retorna 400 com importId invalido", async () => {
    const token = await registerAndLogin("import-commit-id-invalido@controlfinance.dev");
    await makeProUser("import-commit-id-invalido@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: "abc",
      });

    expectErrorResponseWithRequestId(response, 400, "importId invalido.");
  });

  it("POST /transactions/import/commit importa linhas validas e marca sessao como confirmada", async () => {
    const token = await registerAndLogin("import-commit-sucesso@controlfinance.dev");
    await makeProUser("import-commit-sucesso@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const dryRunCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-03-01,Entrada,1000,Salario,,",
        "2026-03-05,Saida,220.5,Mercado,,Alimentacao",
        "2026-03-10,Saida,0,Cafe,,Alimentacao",
      ].join("\n"),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    expect(dryRunResponse.status).toBe(200);
    expect(dryRunResponse.body.summary.validRows).toBe(2);

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body).toEqual({
      imported: 2,
      summary: {
        income: 1000,
        expense: 220.5,
        balance: 779.5,
      },
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta.total).toBe(2);
    expect(listResponse.body.data).toEqual([
      expect.objectContaining({
        description: "Salario",
        type: "Entrada",
        value: 1000,
        categoryId: null,
      }),
      expect.objectContaining({
        description: "Mercado",
        type: "Saida",
        value: 220.5,
        categoryId: categoryResponse.body.id,
      }),
    ]);

    const persistedSessionResult = await dbQuery(
      `
        SELECT committed_at
        FROM transaction_import_sessions
        WHERE id = $1
      `,
      [dryRunResponse.body.importId],
    );
    expect(persistedSessionResult.rows[0].committed_at).toBeTruthy();
  });

  it("POST /transactions/import/commit retorna 404 para sessao de outro usuario", async () => {
    const ownerToken = await registerAndLogin("import-commit-owner@controlfinance.dev");
    await makeProUser("import-commit-owner@controlfinance.dev");
    const guestToken = await registerAndLogin("import-commit-guest@controlfinance.dev");
    await makeProUser("import-commit-guest@controlfinance.dev");

    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-01,Entrada,100,Freela,,"].join(
        "\n",
      ),
    );

    const ownerDryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        importId: ownerDryRunResponse.body.importId,
      });

    expectErrorResponseWithRequestId(response, 404, "Sessao de importacao nao encontrada.");
  });

  it("POST /transactions/import/commit retorna 409 quando sessao ja foi confirmada", async () => {
    const token = await registerAndLogin("import-commit-duplicado@controlfinance.dev");
    await makeProUser("import-commit-duplicado@controlfinance.dev");
    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-02,Saida,50,Mercado,,"].join(
        "\n",
      ),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    const firstCommitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    const secondCommitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expect(firstCommitResponse.status).toBe(200);
    expectErrorResponseWithRequestId(secondCommitResponse, 409, "Importacao ja confirmada.");
  });

  it("POST /transactions/import/commit retorna 410 quando sessao expirou", async () => {
    const token = await registerAndLogin("import-commit-expirado@controlfinance.dev");
    await makeProUser("import-commit-expirado@controlfinance.dev");
    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-03,Saida,30,Lanche,,"].join("\n"),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    await dbQuery(
      `
        UPDATE transaction_import_sessions
        SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1
      `,
      [dryRunResponse.body.importId],
    );

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expectErrorResponseWithRequestId(commitResponse, 410, "Sessao de importacao expirada.");
  });
});
