import app from "./app.js";
import { assertJwtEnvironmentConsistency } from "./config/jwt-env-guard.js";
import { assertStripeEnvironmentConsistency } from "./config/stripe-env-guard.js";
import { getDatabaseConnectionDiagnostics } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startImportSessionsCleanupJob } from "./jobs/import-sessions-cleanup.job.js";
import { logError, logInfo } from "./observability/logger.js";

const port = Number(process.env.PORT) || 3001;

const startServer = async () => {
  assertJwtEnvironmentConsistency();
  assertStripeEnvironmentConsistency();
  await runMigrations();
  startImportSessionsCleanupJob();

  app.listen(port, () => {
    logInfo({
      event: "api.server.started",
      message: `api running on http://localhost:${port}`,
      port,
    });
  });
};

startServer().catch((error) => {
  const shouldExposeStack = process.env.NODE_ENV !== "production";

  logError({
    event: "api.server.startup_failed",
    message: "Failed to start API server.",
    errorMessage: error?.message || "Unexpected error.",
    stack: shouldExposeStack && typeof error?.stack === "string" ? error.stack : undefined,
    database: getDatabaseConnectionDiagnostics(),
  });
  process.exit(1);
});
