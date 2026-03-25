import { dbQuery } from "../db/index.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX_LENGTH = 200;
const ICON_MAX_LENGTH = 50;
const NOTES_MAX_LENGTH = 1000;
const VALID_ICONS = new Set([
  "target", "plane", "home", "car", "graduation", "heart",
  "star", "gift", "briefcase", "umbrella",
]);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeGoalId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de meta invalido.");
  }
  return parsed;
};

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

/**
 * Months remaining from `now` until `targetDate` (inclusive of current month).
 * Returns 0 if the date is in the past.
 */
const monthsUntil = (targetDate, now = new Date()) => {
  const target = new Date(`${targetDate}T00:00:00`);
  const diff =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(0, diff);
};

/**
 * How much the user needs to save each month to reach the goal on time.
 * Returns 0 if the goal is already met or the date has passed.
 */
export const calcMonthlyNeeded = (targetAmount, currentAmount, targetDate, now = new Date()) => {
  const remaining = toMoney(targetAmount) - toMoney(currentAmount);
  if (remaining <= 0) return 0;
  const months = monthsUntil(targetDate, now);
  if (months === 0) return remaining; // overdue — full remaining needed now
  return Number((remaining / months).toFixed(2));
};

const rowToGoal = (row, now = new Date()) => {
  const targetDate =
    typeof row.target_date === "string"
      ? row.target_date.slice(0, 10)
      : new Date(row.target_date).toISOString().slice(0, 10);

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    targetDate,
    icon: row.icon,
    notes: row.notes ?? null,
    monthlyNeeded: calcMonthlyNeeded(row.target_amount, row.current_amount, targetDate, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listGoalsForUser = async (userId, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const result = await dbQuery(
    `SELECT * FROM user_goals
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY target_date ASC, id ASC`,
    [uid],
  );
  return result.rows.map((row) => rowToGoal(row, now));
};

export const createGoalForUser = async (userId, data, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const { title, target_amount, current_amount, target_date, icon, notes } = data ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    throw createError(400, "Titulo da meta e obrigatorio.");
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    throw createError(400, `Titulo deve ter no maximo ${TITLE_MAX_LENGTH} caracteres.`);
  }

  const targetAmt = Number(target_amount);
  if (!Number.isFinite(targetAmt) || targetAmt <= 0) {
    throw createError(400, "Valor alvo deve ser maior que zero.");
  }

  const currentAmt = current_amount !== undefined ? Number(current_amount) : 0;
  if (!Number.isFinite(currentAmt) || currentAmt < 0) {
    throw createError(400, "Valor atual nao pode ser negativo.");
  }
  if (currentAmt > targetAmt) {
    throw createError(400, "Valor atual nao pode superar o valor alvo.");
  }

  if (!isValidISODate(target_date)) {
    throw createError(400, "Data alvo invalida. Use o formato YYYY-MM-DD.");
  }

  const resolvedIcon = icon && VALID_ICONS.has(icon) ? icon : "target";

  const resolvedNotes =
    notes !== undefined && notes !== null
      ? String(notes).slice(0, NOTES_MAX_LENGTH) || null
      : null;

  const result = await dbQuery(
    `INSERT INTO user_goals
       (user_id, title, target_amount, current_amount, target_date, icon, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uid, title.trim(), toMoney(targetAmt), toMoney(currentAmt), target_date, resolvedIcon, resolvedNotes],
  );

  return rowToGoal(result.rows[0], now);
};

export const updateGoalForUser = async (userId, goalId, data, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const gid = normalizeGoalId(goalId);

  const existing = await dbQuery(
    `SELECT * FROM user_goals WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [gid, uid],
  );
  if (existing.rows.length === 0) {
    throw createError(404, "Meta nao encontrada.");
  }

  const prev = existing.rows[0];
  const { title, target_amount, current_amount, target_date, icon, notes } = data ?? {};

  const nextTitle =
    title !== undefined
      ? (typeof title === "string" && title.trim() ? title.trim() : null)
      : prev.title;
  if (!nextTitle) throw createError(400, "Titulo da meta nao pode ser vazio.");
  if (nextTitle.length > TITLE_MAX_LENGTH) {
    throw createError(400, `Titulo deve ter no maximo ${TITLE_MAX_LENGTH} caracteres.`);
  }

  const nextTarget =
    target_amount !== undefined ? Number(target_amount) : Number(prev.target_amount);
  if (!Number.isFinite(nextTarget) || nextTarget <= 0) {
    throw createError(400, "Valor alvo deve ser maior que zero.");
  }

  const nextCurrent =
    current_amount !== undefined ? Number(current_amount) : Number(prev.current_amount);
  if (!Number.isFinite(nextCurrent) || nextCurrent < 0) {
    throw createError(400, "Valor atual nao pode ser negativo.");
  }
  if (nextCurrent > nextTarget) {
    throw createError(400, "Valor atual nao pode superar o valor alvo.");
  }

  const nextDate = target_date !== undefined ? target_date : prev.target_date;
  if (!isValidISODate(typeof nextDate === "string" ? nextDate : nextDate.toISOString().slice(0, 10))) {
    throw createError(400, "Data alvo invalida. Use o formato YYYY-MM-DD.");
  }

  const nextIcon = icon !== undefined && VALID_ICONS.has(icon) ? icon : prev.icon;

  const nextNotes =
    notes !== undefined
      ? (notes !== null ? String(notes).slice(0, NOTES_MAX_LENGTH) || null : null)
      : prev.notes;

  const result = await dbQuery(
    `UPDATE user_goals
     SET title          = $1,
         target_amount  = $2,
         current_amount = $3,
         target_date    = $4,
         icon           = $5,
         notes          = $6,
         updated_at     = NOW()
     WHERE id = $7 AND user_id = $8 AND deleted_at IS NULL
     RETURNING *`,
    [nextTitle, toMoney(nextTarget), toMoney(nextCurrent), nextDate, nextIcon, nextNotes, gid, uid],
  );

  return rowToGoal(result.rows[0], now);
};

export const deleteGoalForUser = async (userId, goalId) => {
  const uid = normalizeUserId(userId);
  const gid = normalizeGoalId(goalId);

  const result = await dbQuery(
    `UPDATE user_goals SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [gid, uid],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Meta nao encontrada.");
  }
};

/**
 * Returns a summary of active goals for use in the AI prompt context.
 * Lightweight — only the fields the LLM needs.
 */
export const getGoalsSummaryForAI = async (userId, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const result = await dbQuery(
    `SELECT title, target_amount, current_amount, target_date
     FROM user_goals
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY target_date ASC
     LIMIT 5`,
    [uid],
  );

  return result.rows.map((row) => ({
    title: row.title,
    monthly_needed: calcMonthlyNeeded(row.target_amount, row.current_amount, row.target_date, now),
    progress_pct: row.target_amount > 0
      ? Number(((row.current_amount / row.target_amount) * 100).toFixed(1))
      : 0,
  }));
};
