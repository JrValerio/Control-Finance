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
      duplicateRows: 0,
      conflictRows: 0,
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
      duplicateRows: 0,
      conflictRows: 0,
      income: 2812.99,
      expense: 15.98,
    });
    expect(response.body.rows).toMatchObject([
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

  it("POST/GET/DELETE /transactions/import/rules cria, lista e remove regras do usuario", async () => {
    const token = await registerAndLogin("import-rules@controlfinance.dev");
    await makeProUser("import-rules@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Moradia" });

    expect(categoryResponse.status).toBe(201);

    const createResponse = await request(app)
      .post("/transactions/import/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        matchText: "neoenergia",
        categoryId: categoryResponse.body.id,
        transactionType: "Saida",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      matchText: "neoenergia",
      categoryId: categoryResponse.body.id,
      categoryName: "Moradia",
      transactionType: "Saida",
    });

    const listResponse = await request(app)
      .get("/transactions/import/rules")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toEqual([
      expect.objectContaining({
        id: createResponse.body.id,
        matchText: "neoenergia",
        categoryName: "Moradia",
        transactionType: "Saida",
      }),
    ]);

    const deleteResponse = await request(app)
      .delete(`/transactions/import/rules/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      id: createResponse.body.id,
      success: true,
    });
  });

  it("POST /transactions/import/dry-run aplica regra salva antes da heuristica padrao", async () => {
    const token = await registerAndLogin("import-rules-dry-run@controlfinance.dev");
    await makeProUser("import-rules-dry-run@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Saude" });

    expect(categoryResponse.status).toBe(201);

    const createRuleResponse = await request(app)
      .post("/transactions/import/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        matchText: "farmacia",
        categoryId: categoryResponse.body.id,
        transactionType: "Saida",
      });

    expect(createRuleResponse.status).toBe(201);

    const csv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-03-02,Saida,89.9,PIX FARMACIA CENTRAL,,",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(response.status).toBe(200);
    expect(response.body.rows[0].raw.category).toBe("Saude");
    expect(response.body.rows[0].normalized.categoryId).toBe(categoryResponse.body.id);
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
      duplicateRows: 0,
      conflictRows: 0,
      income: 1000,
      expense: 220.5,
    });
    expect(response.body.rows).toMatchObject([
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
      duplicateRows: 0,
      conflictRows: 0,
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
    expect(commitResponse.body).toMatchObject({
      imported: 2,
      summary: {
        income: 1000,
        expense: 220.5,
        balance: 779.5,
      },
    });
    expect(typeof commitResponse.body.importSessionId).toBe("string");

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

  it("POST /transactions/import/dry-run marca linhas como duplicate quando ja existem no historico", async () => {
    const token = await registerAndLogin("import-dedupe@controlfinance.dev");
    await makeProUser("import-dedupe@controlfinance.dev");

    const csv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-01,Entrada,1000,Salario,,"].join(
        "\n",
      ),
    );

    // primeira importacao
    const first = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(first.status).toBe(200);
    expect(first.body.summary.validRows).toBe(1);

    await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: first.body.importId });

    // segunda importacao do mesmo arquivo
    const second = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(second.status).toBe(200);
    expect(second.body.summary.validRows).toBe(0);
    expect(second.body.summary.duplicateRows).toBe(1);
    expect(second.body.rows[0].status).toBe("duplicate");
    expect(second.body.rows[0].normalized).toBeNull();
  });

  it("POST /transactions/import/dry-run marca conflito quando credito bancario bate com historico de renda", async () => {
    const email = "import-income-conflict@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const sourceResponse = await request(app)
      .post("/income-sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "INSS Beneficio",
      });

    expect(sourceResponse.status).toBe(201);

    const statementResponse = await request(app)
      .post(`/income-sources/${sourceResponse.body.id}/statements`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        referenceMonth: "2026-03",
        netAmount: 1412,
        paymentDate: "2026-03-05",
      });

    expect(statementResponse.status).toBe(201);

    const csv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-03-06,Entrada,1412,CREDITO BENEFICIO INSS,,",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRows: 1,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      conflictRows: 1,
      income: 0,
      expense: 0,
    });
    expect(response.body.rows[0]).toMatchObject({
      line: 2,
      status: "conflict",
      normalized: null,
      statusDetail: "INSS Beneficio ja registrado no historico de renda (2026-03, 2026-03-05).",
      conflict: {
        type: "income_statement",
        statementId: statementResponse.body.statement.id,
        sourceName: "INSS Beneficio",
        referenceMonth: "2026-03",
        paymentDate: "2026-03-05",
        netAmount: 1412,
        status: "draft",
        postedTransactionId: null,
      },
    });

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: response.body.importId });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.imported).toBe(0);

    const userId = await getUserIdByEmail(email);
    const transactionCountResult = await dbQuery(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`,
      [userId],
    );

    expect(Number(transactionCountResult.rows[0].count)).toBe(0);
  });

  it("POST /transactions/import/commit nao insere duplicatas mesmo se sessao foi criada antes do primeiro commit", async () => {
    const token = await registerAndLogin("import-dedupe-commit@controlfinance.dev");
    await makeProUser("import-dedupe-commit@controlfinance.dev");

    const csv = csvFile(
      ["date,type,value,description,notes,category", "2026-04-01,Entrada,2000,Freelance,,"].join(
        "\n",
      ),
    );

    // dry-run A
    const dryA = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    // dry-run B (mesmo arquivo, antes de qualquer commit)
    const dryB = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    // commit A
    await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryA.body.importId });

    // commit B — sessao criada antes do commit A; a linha ja existe agora
    const commitB = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryB.body.importId });

    expect(commitB.status).toBe(200);
    // a linha duplicada foi inserida (sessao B nao sabia da A no momento do dry-run)
    // mas o fingerprint agora esta no banco — proximo dry-run vai detectar
    const check = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(check.body.summary.duplicateRows).toBeGreaterThan(0);
  });

  it("POST /transactions/import/dry-run retorna documentType bank_statement para CSV manual", async () => {
    const token = await registerAndLogin("import-doctype-csv@controlfinance.dev");
    await makeProUser("import-doctype-csv@controlfinance.dev");
    const csv = csvFile(
      ["date,type,value,description", "2026-02-05,Entrada,100,Salario"].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(response.status).toBe(200);
    expect(response.body.documentType).toBe("bank_statement");
  });

  it("POST /transactions/import/dry-run retorna documentType bank_statement para OFX", async () => {
    const token = await registerAndLogin("import-doctype-ofx@controlfinance.dev");
    await makeProUser("import-doctype-ofx@controlfinance.dev");
    const ofxFile = csvFile(
      [
        "OFXHEADER:100",
        "DATA:OFXSGML",
        "<OFX>",
        "<BANKTRANLIST>",
        "<STMTTRN>",
        "<TRNTYPE>CREDIT",
        "<DTPOSTED>20260205000000[-3:BRT]",
        "<TRNAMT>100.00",
        "<FITID>DOC001",
        "<MEMO>Teste OFX documentType</MEMO>",
        "</STMTTRN>",
      ].join("\n"),
      "extrato.ofx",
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", ofxFile.buffer, { filename: ofxFile.fileName, contentType: "application/ofx" });

    expect(response.status).toBe(200);
    expect(response.body.documentType).toBe("bank_statement");
  });

  it("POST /transactions/import/commit retorna importSessionId", async () => {
    const token = await registerAndLogin("import-session-id@controlfinance.dev");
    await makeProUser("import-session-id@controlfinance.dev");

    const csv = csvFile("date,type,value,description\n2026-03-01,Entrada,500,Teste sessao");

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(dryRunResponse.status).toBe(200);

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryRunResponse.body.importId });

    expect(commitResponse.status).toBe(200);
    expect(typeof commitResponse.body.importSessionId).toBe("string");
    expect(commitResponse.body.importSessionId).toBe(dryRunResponse.body.importId);
    expect(commitResponse.body.imported).toBe(1);
  });

  it("POST /transactions/import/commit retorna createdTransactions com id e line", async () => {
    const token = await registerAndLogin("import-created-txs@controlfinance.dev");
    await makeProUser("import-created-txs@controlfinance.dev");

    const csv = csvFile(
      "date,type,value,description\n2026-03-01,Entrada,1412.00,INSS Credito\n2026-03-02,Saida,80.00,Supermercado",
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(dryRunResponse.status).toBe(200);

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryRunResponse.body.importId });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.imported).toBe(2);

    const { createdTransactions } = commitResponse.body;
    expect(Array.isArray(createdTransactions)).toBe(true);
    expect(createdTransactions).toHaveLength(2);

    const entry = createdTransactions.find((tx) => tx.type === "Entrada");
    expect(entry).toMatchObject({
      type: "Entrada",
      value: 1412,
      date: "2026-03-01",
      description: "INSS Credito",
    });
    expect(typeof entry.id).toBe("number");
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.line).toBeGreaterThan(0);

    const exit = createdTransactions.find((tx) => tx.type === "Saida");
    expect(exit).toMatchObject({
      type: "Saida",
      value: 80,
      date: "2026-03-02",
    });
  });

  it("DELETE /transactions/imports/:sessionId desfaz importacao por sessao", async () => {
    const token = await registerAndLogin("import-undo@controlfinance.dev");
    await makeProUser("import-undo@controlfinance.dev");

    const csv = csvFile(
      "date,type,value,description\n2026-03-01,Entrada,100,Transacao A\n2026-03-02,Saida,50,Transacao B",
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    expect(dryRunResponse.status).toBe(200);

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ importId: dryRunResponse.body.importId });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.imported).toBe(2);

    const sessionId = commitResponse.body.importSessionId;

    const undoResponse = await request(app)
      .delete(`/transactions/imports/${sessionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(undoResponse.status).toBe(200);
    expect(undoResponse.body.importSessionId).toBe(sessionId);
    expect(undoResponse.body.deletedCount).toBe(2);
    expect(undoResponse.body.success).toBe(true);

    // Transacoes devem estar soft-deleted (GET retorna zero)
    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(0);
  });

  it("DELETE /transactions/imports/:sessionId retorna 404 para sessao de outro usuario", async () => {
    const tokenA = await registerAndLogin("import-undo-owner-a@controlfinance.dev");
    const tokenB = await registerAndLogin("import-undo-owner-b@controlfinance.dev");
    await makeProUser("import-undo-owner-a@controlfinance.dev");

    const csv = csvFile("date,type,value,description\n2026-03-01,Entrada,100,Teste");

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("file", csv.buffer, { filename: csv.fileName, contentType: "text/csv" });

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ importId: dryRunResponse.body.importId });

    const sessionId = commitResponse.body.importSessionId;

    const undoResponse = await request(app)
      .delete(`/transactions/imports/${sessionId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expectErrorResponseWithRequestId(undoResponse, 404, "Sessao de importacao nao encontrada.");
  });

  it("DELETE /transactions/imports/:sessionId bloqueia sem token", async () => {
    const response = await request(app).delete(
      "/transactions/imports/00000000-0000-4000-8000-000000000000",
    );

    expect(response.status).toBe(401);
  });

  it("POST /transactions/bulk-delete exclui transacoes selecionadas", async () => {
    const token = await registerAndLogin("bulk-delete@controlfinance.dev");

    const t1 = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Entrada", value: 100, date: "2026-03-01", description: "T1" });
    const t2 = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Entrada", value: 200, date: "2026-03-02", description: "T2" });
    const t3 = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Saida", value: 50, date: "2026-03-03", description: "T3" });

    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    expect(t3.status).toBe(201);

    const bulkResponse = await request(app)
      .post("/transactions/bulk-delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionIds: [t1.body.id, t2.body.id] });

    expect(bulkResponse.status).toBe(200);
    expect(bulkResponse.body.deletedCount).toBe(2);
    expect(bulkResponse.body.success).toBe(true);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].id).toBe(t3.body.id);
  });

  it("POST /transactions/bulk-delete nao exclui transacoes de outro usuario", async () => {
    const tokenA = await registerAndLogin("bulk-delete-owner-a@controlfinance.dev");
    const tokenB = await registerAndLogin("bulk-delete-owner-b@controlfinance.dev");

    const tx = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "Entrada", value: 100, date: "2026-03-01", description: "De A" });

    expect(tx.status).toBe(201);

    const bulkResponse = await request(app)
      .post("/transactions/bulk-delete")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ transactionIds: [tx.body.id] });

    expect(bulkResponse.status).toBe(200);
    expect(bulkResponse.body.deletedCount).toBe(0);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listResponse.body.data).toHaveLength(1);
  });

  it("POST /transactions/bulk-delete retorna deletedCount 0 para lista vazia", async () => {
    const token = await registerAndLogin("bulk-delete-empty@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/bulk-delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ transactionIds: [] });

    expect(response.status).toBe(200);
    expect(response.body.deletedCount).toBe(0);
    expect(response.body.success).toBe(true);
  });

  it("POST /transactions/bulk-delete bloqueia sem token", async () => {
    const response = await request(app)
      .post("/transactions/bulk-delete")
      .send({ transactionIds: [1] });

    expect(response.status).toBe(401);
  });
});
