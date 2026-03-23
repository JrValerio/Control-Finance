import { Router } from "express";
import {
  resolveApiBuildTimestamp,
  resolveApiCommit,
  resolveApiVersion,
} from "../config/version.js";
import { checkDatabaseHealth } from "../db/index.js";
import { getMigrationStatus } from "../db/migrate.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const [db, migrations] = await Promise.all([
      checkDatabaseHealth(),
      getMigrationStatus(),
    ]);
    const responsePayload = {
      ok: db.status === "ok",
      version: resolveApiVersion(),
      commit: resolveApiCommit(),
      buildTimestamp: resolveApiBuildTimestamp(),
      uptimeSeconds: Math.floor(process.uptime()),
      db,
      migrations,
      requestId: req.requestId || null,
    };

    return res.status(responsePayload.ok ? 200 : 503).json(responsePayload);
  } catch (error) {
    return next(error);
  }
});

export default router;
