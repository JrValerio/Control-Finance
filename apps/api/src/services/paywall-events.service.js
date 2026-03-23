import { dbQuery } from "../db/index.js";

const VALID_FEATURES = new Set([
  "csv_import",
  "csv_export",
  "forecast",
  "analytics_trend",
  "salary",
  "unknown",
]);

const VALID_ACTIONS = new Set(["viewed", "clicked_upgrade", "dismissed"]);

const VALID_CONTEXTS = new Set(["trial_expired", "feature_gate"]);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const recordPaywallEvent = async ({ userId, feature, action, context }) => {
  if (!VALID_FEATURES.has(feature)) {
    throw createError(400, "feature invalido.");
  }

  if (!VALID_ACTIONS.has(action)) {
    throw createError(400, "action invalido.");
  }

  if (!VALID_CONTEXTS.has(context)) {
    throw createError(400, "context invalido.");
  }

  const result = await dbQuery(
    `INSERT INTO paywall_events (user_id, feature, action, context)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, feature, action, context, created_at`,
    [userId, feature, action, context],
  );

  return result.rows[0];
};
