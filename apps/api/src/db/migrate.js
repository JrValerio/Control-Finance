import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withDbClient } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATIONS_TABLE = "schema_migrations";

// Stable bigint key for pg_try_advisory_lock — unique to this application.
const MIGRATION_LOCK_KEY = 6329271;

const tryAcquireMigrationLock = async (client) => {
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      [MIGRATION_LOCK_KEY],
    );
    return rows[0].acquired === true;
  } catch {
    // pg_try_advisory_lock not available (e.g. pg-mem in tests) — proceed unlocked.
    return true;
  }
};

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const listMigrationFiles = async () => {
  const directoryEntries = await fs.readdir(MIGRATIONS_DIR, {
    withFileTypes: true,
  });

  return directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
};

const getAppliedMigrations = async (client) => {
  const { rows } = await client.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((row) => row.name));
};

export const runMigrations = async () => {
  return withDbClient(async (client) => {
    const acquired = await tryAcquireMigrationLock(client);

    if (!acquired) {
      console.warn("Migrations already running in another process. Skipping to avoid conflict.");
      return;
    }

    await ensureMigrationsTable(client);

    const migrationFiles = await listMigrationFiles();
    const appliedMigrations = await getAppliedMigrations(client);

    for (const migrationFile of migrationFiles) {
      if (appliedMigrations.has(migrationFile)) {
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, migrationFile);
      const migrationSql = await fs.readFile(filePath, "utf8");

      await client.query(migrationSql);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [
        migrationFile,
      ]);
    }

    // Advisory lock is released automatically when the client is released.
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log("Database migrations executed successfully.");
    })
    .catch((error) => {
      console.error("Failed to run database migrations.", error);
      process.exit(1);
    });
}
