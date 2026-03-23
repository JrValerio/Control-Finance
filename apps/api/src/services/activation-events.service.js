import { dbQuery } from "../db/index.js";

const VALID_EVENTS = new Set([
  "welcome_card_viewed",
  "welcome_cta_clicked",
  "transaction_modal_opened",
  "first_transaction_created",
]);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const recordActivationEvent = async ({ userId, event }) => {
  if (!VALID_EVENTS.has(event)) {
    throw createError(400, "event invalido.");
  }

  const result = await dbQuery(
    `INSERT INTO activation_events (user_id, event)
     VALUES ($1, $2)
     RETURNING id, user_id, event, created_at`,
    [userId, event],
  );

  return result.rows[0];
};
