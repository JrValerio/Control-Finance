import { dbQuery } from "../db/index.js";
import { logError } from "../observability/logger.js";

const DEFAULT_IMPORT_SESSION_CLEANUP_INTERVAL_MINUTES = 30;
const DEFAULT_IMPORT_SESSION_KEEP_COMMITTED_DAYS = 7;

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const getCleanupIntervalMs = () => {
  const intervalMinutes = parsePositiveInteger(
    process.env.IMPORT_SESSION_CLEANUP_INTERVAL_MINUTES,
    DEFAULT_IMPORT_SESSION_CLEANUP_INTERVAL_MINUTES,
  );

  return intervalMinutes * 60 * 1000;
};

const getKeepCommittedDays = () =>
  parsePositiveInteger(
    process.env.IMPORT_SESSION_KEEP_COMMITTED_DAYS,
    DEFAULT_IMPORT_SESSION_KEEP_COMMITTED_DAYS,
  );

const cleanupImportSessions = async () => {
  const keepCommittedDays = getKeepCommittedDays();

  await dbQuery(
    `
      DELETE FROM transaction_import_sessions
      WHERE expires_at < NOW()
         OR (
           committed_at IS NOT NULL
           AND committed_at < NOW() - ($1 * INTERVAL '1 day')
         )
    `,
    [keepCommittedDays],
  );
};

export const startImportSessionsCleanupJob = () => {
  if ((process.env.NODE_ENV || "").toLowerCase() === "test") {
    return () => {};
  }

  const runCleanup = async () => {
    try {
      await cleanupImportSessions();
    } catch (err) {
      logError({
        event: "import_sessions.cleanup.failed",
        message: "Import sessions cleanup job encountered an error.",
        errorMessage: err?.message ?? "Unexpected error.",
      });
    }
  };

  void runCleanup();

  const cleanupTimer = setInterval(() => {
    void runCleanup();
  }, getCleanupIntervalMs());

  return () => {
    clearInterval(cleanupTimer);
  };
};
