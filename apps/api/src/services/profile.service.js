import { dbQuery } from "../db/index.js";

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

// Returns undefined → field was not sent (skip update)
// Returns null     → field was explicitly set to null (clear)
// Returns value    → set to that value

const normalizeDisplayName = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw createError(400, "display_name deve ser texto.");
  const trimmed = value.trim();
  if (trimmed.length > 100) throw createError(400, "display_name deve ter no maximo 100 caracteres.");
  return trimmed || null;
};

const normalizeSalaryMonthly = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw createError(400, "salary_monthly deve ser um numero.");
  if (n < 0) throw createError(400, "salary_monthly nao pode ser negativo.");
  return n;
};

const normalizePayday = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    throw createError(400, "payday deve ser um inteiro entre 1 e 31.");
  }
  return n;
};

const normalizeAvatarUrl = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw createError(400, "avatar_url deve ser texto.");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("https://")) {
    throw createError(400, "avatar_url deve comecar com https://.");
  }
  if (trimmed.length > 2048) {
    throw createError(400, "avatar_url deve ter no maximo 2048 caracteres.");
  }
  return trimmed;
};

const AI_TONE_VALID = ["pragmatic", "motivator", "sarcastic"];
const AI_INSIGHT_FREQUENCY_VALID = ["always", "risk_only"];

const normalizeAiTone = (value) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !AI_TONE_VALID.includes(value)) {
    throw createError(400, `ai_tone deve ser um de: ${AI_TONE_VALID.join(", ")}.`);
  }
  return value;
};

const normalizeAiInsightFrequency = (value) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !AI_INSIGHT_FREQUENCY_VALID.includes(value)) {
    throw createError(
      400,
      `ai_insight_frequency deve ser um de: ${AI_INSIGHT_FREQUENCY_VALID.join(", ")}.`,
    );
  }
  return value;
};

const rowToProfile = (row) => ({
  displayName: row.display_name ?? null,
  salaryMonthly:
    row.salary_monthly !== null && row.salary_monthly !== undefined
      ? Number(row.salary_monthly)
      : null,
  payday: row.payday !== null && row.payday !== undefined ? Number(row.payday) : null,
  avatarUrl: row.avatar_url ?? null,
  aiTone: AI_TONE_VALID.includes(row.ai_tone) ? row.ai_tone : "pragmatic",
  aiInsightFrequency: AI_INSIGHT_FREQUENCY_VALID.includes(row.ai_insight_frequency)
    ? row.ai_insight_frequency
    : "always",
});

// Returns ISO string for trial end date and whether trial has expired
const extractTrialInfo = (user) => {
  const trialEndsAt = user.trial_ends_at ? new Date(user.trial_ends_at).toISOString() : null;
  const trialExpired = trialEndsAt ? new Date(trialEndsAt) <= new Date() : false;
  return { trialEndsAt, trialExpired };
};

// Calculates the next occurrence of `payday` from `referenceDate`
const calcNextPaydayDate = (payday, referenceDate = new Date()) => {
  const day = referenceDate.getDate();
  if (payday > day) {
    return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), payday);
  }
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, payday);
};

export const getMyProfile = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const userResult = await dbQuery(
    `SELECT id, name, email, (password_hash IS NOT NULL) AS has_password, trial_ends_at
     FROM users WHERE id = $1 LIMIT 1`,
    [normalizedUserId],
  );

  if (userResult.rows.length === 0) {
    throw createError(404, "Usuario nao encontrado.");
  }

  const user = userResult.rows[0];
  const { trialEndsAt, trialExpired } = extractTrialInfo(user);

  const [profileResult, identitiesResult] = await Promise.all([
    dbQuery(
      `SELECT display_name, salary_monthly, payday, avatar_url, ai_tone, ai_insight_frequency
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [normalizedUserId],
    ),
    dbQuery(
      `SELECT provider FROM user_identities WHERE user_id = $1`,
      [normalizedUserId],
    ),
  ]);

  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    hasPassword: Boolean(user.has_password),
    linkedProviders: identitiesResult.rows.map((r) => r.provider),
    trialEndsAt,
    trialExpired,
    profile: profileResult.rows.length > 0 ? rowToProfile(profileResult.rows[0]) : null,
  };
};

export const updateMyProfile = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);

  // Normalize only fields that were explicitly sent (undefined = not sent)
  const updates = {};

  const displayName = normalizeDisplayName(payload.display_name);
  if (displayName !== undefined) updates.display_name = displayName;

  const salaryMonthly = normalizeSalaryMonthly(payload.salary_monthly);
  if (salaryMonthly !== undefined) updates.salary_monthly = salaryMonthly;

  const normalizedPayday = normalizePayday(payload.payday);
  if (normalizedPayday !== undefined) updates.payday = normalizedPayday;

  const avatarUrl = normalizeAvatarUrl(payload.avatar_url);
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  const aiTone = normalizeAiTone(payload.ai_tone);
  if (aiTone !== undefined) updates.ai_tone = aiTone;

  const aiInsightFrequency = normalizeAiInsightFrequency(payload.ai_insight_frequency);
  if (aiInsightFrequency !== undefined) updates.ai_insight_frequency = aiInsightFrequency;

  if (Object.keys(updates).length === 0) {
    throw createError(400, "Nenhum campo valido enviado para atualizacao.");
  }

  const cols = Object.keys(updates);
  const vals = Object.values(updates);
  const now = new Date().toISOString();

  // $1 = userId, $2..$N = field values, $N+1 = now
  const nowIdx = vals.length + 2;
  const insertColsSql = ["user_id", ...cols, "updated_at"].join(", ");
  const insertPlaceholders = ["$1", ...cols.map((_, i) => `$${i + 2}`), `$${nowIdx}`].join(", ");
  const setClauses = [
    ...cols.map((col, i) => `${col} = $${i + 2}`),
    `updated_at = $${nowIdx}`,
  ].join(", ");

  await dbQuery(
    `INSERT INTO user_profiles (${insertColsSql})
     VALUES (${insertPlaceholders})
     ON CONFLICT (user_id)
     DO UPDATE SET ${setClauses}`,
    [normalizedUserId, ...vals, now],
  );

  // When payday is set, extend trial_ends_at = MAX(created_at + 14 days, next payday)
  // so users always see at least one full pay cycle before trial expires.
  if (normalizedPayday !== undefined && normalizedPayday !== null) {
    const userRow = await dbQuery(
      `SELECT created_at, trial_ends_at FROM users WHERE id = $1 LIMIT 1`,
      [normalizedUserId],
    );
    const { created_at: createdAt } = userRow.rows[0];
    const signupPlus14 = new Date(new Date(createdAt).getTime() + 14 * 24 * 60 * 60 * 1000);
    const nextPayday = calcNextPaydayDate(normalizedPayday);
    const newTrialEndsAt = signupPlus14 > nextPayday ? signupPlus14 : nextPayday;
    await dbQuery(
      `UPDATE users SET trial_ends_at = $2 WHERE id = $1`,
      [normalizedUserId, newTrialEndsAt.toISOString()],
    );
  }

  const result = await dbQuery(
    `SELECT display_name, salary_monthly, payday, avatar_url, ai_tone, ai_insight_frequency
     FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [normalizedUserId],
  );

  return rowToProfile(result.rows[0]);
};
