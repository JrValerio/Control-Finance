import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep a reference so individual tests can change query behaviour.
let queryMock;
let releaseMock;

vi.mock("./index.js", () => ({
  withDbClient: vi.fn(async (callback) => {
    const client = { query: queryMock, release: releaseMock };
    return callback(client);
  }),
}));

// Stub the filesystem so we control which migration files exist.
vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

import fs from "node:fs/promises";
import { withDbClient } from "./index.js";
import { runMigrations } from "./migrate.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeEntry = (name) => ({ isFile: () => true, name });

const setupQueryMock = ({
  lockAcquired = true,
  appliedMigrations = [],
} = {}) => {
  queryMock = vi.fn(async (sql) => {
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ acquired: lockAcquired }] };
    }
    if (sql.includes("SELECT name FROM schema_migrations")) {
      return { rows: appliedMigrations.map((name) => ({ name })) };
    }
    return { rows: [] };
  });
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("runMigrations", () => {
  beforeEach(() => {
    releaseMock = vi.fn();
    vi.clearAllMocks();
    fs.readFile.mockResolvedValue("SELECT 1;");
  });

  it("executa migracoes pendentes quando lock e adquirido", async () => {
    setupQueryMock({ appliedMigrations: ["001_initial.sql"] });
    fs.readdir.mockResolvedValue([
      makeEntry("001_initial.sql"),
      makeEntry("002_add_users.sql"),
    ]);

    await runMigrations();

    const sqlCalls = queryMock.mock.calls.map(([sql]) => sql);
    const insertCalls = sqlCalls.filter((sql) => sql.includes("INSERT INTO schema_migrations"));
    expect(insertCalls).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO schema_migrations"), [
      "002_add_users.sql",
    ]);
  });

  it("nao executa migracoes quando lock nao e adquirido", async () => {
    setupQueryMock({ lockAcquired: false });
    fs.readdir.mockResolvedValue([makeEntry("001_initial.sql")]);

    await runMigrations();

    // Only the advisory lock query should have been called — no CREATE TABLE, no INSERT.
    const sqlCalls = queryMock.mock.calls.map(([sql]) => sql);
    expect(sqlCalls.filter((s) => s.includes("CREATE TABLE"))).toHaveLength(0);
    expect(sqlCalls.filter((s) => s.includes("INSERT"))).toHaveLength(0);
  });

  it("prossegue sem lock quando pg_try_advisory_lock lanca erro (pg-mem)", async () => {
    queryMock = vi.fn(async (sql) => {
      if (sql.includes("pg_try_advisory_lock")) {
        throw new Error("function pg_try_advisory_lock does not exist");
      }
      if (sql.includes("SELECT name FROM schema_migrations")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    fs.readdir.mockResolvedValue([makeEntry("001_initial.sql")]);

    await expect(runMigrations()).resolves.not.toThrow();

    const insertCalls = queryMock.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO schema_migrations"),
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("nao aplica migracoes ja executadas", async () => {
    setupQueryMock({ appliedMigrations: ["001_initial.sql", "002_add_users.sql"] });
    fs.readdir.mockResolvedValue([
      makeEntry("001_initial.sql"),
      makeEntry("002_add_users.sql"),
    ]);

    await runMigrations();

    const insertCalls = queryMock.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO schema_migrations"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("propaga erro quando uma migracao falha", async () => {
    queryMock = vi.fn(async (sql) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("SELECT name FROM schema_migrations")) return { rows: [] };
      if (sql === "SELECT 1;") throw new Error("syntax error in migration");
      return { rows: [] };
    });
    fs.readdir.mockResolvedValue([makeEntry("001_initial.sql")]);

    await expect(runMigrations()).rejects.toThrow("syntax error in migration");
  });

  it("usa withDbClient para garantir liberacao do client via finally", async () => {
    setupQueryMock();
    fs.readdir.mockResolvedValue([]);

    await runMigrations();

    expect(withDbClient).toHaveBeenCalledTimes(1);
  });
});
