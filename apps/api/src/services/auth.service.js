import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { dbQuery } from "../db/index.js";

const DEFAULT_JWT_SECRET = "control-finance-dev-secret";
const DEFAULT_JWT_EXPIRES_IN = "24h";
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE =
  "Senha fraca: use no minimo 8 caracteres com letras e numeros.";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const sanitizeUser = (user) => ({
  id: Number(user.id),
  name: user.name,
  email: user.email,
});

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const getJwtExpiresIn = () =>
  process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;

const getNormalizedEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const validateCredentials = ({ email, password }) => {
  const normalizedEmail = getNormalizedEmail(email);
  const normalizedPassword = typeof password === "string" ? password.trim() : "";

  if (!normalizedEmail || !normalizedPassword) {
    throw createError(400, "Email e senha sao obrigatorios.");
  }

  return { normalizedEmail, normalizedPassword };
};

const validatePasswordStrength = (password) => {
  if (!PASSWORD_REGEX.test(password)) {
    throw createError(400, WEAK_PASSWORD_MESSAGE);
  }
};

const issueAuthToken = (user) =>
  jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() },
  );

const createAuthResult = (user) => {
  const sanitizedUser = sanitizeUser(user);

  return {
    token: issueAuthToken(sanitizedUser),
    user: sanitizedUser,
  };
};

export const registerUser = async ({ name = "", email, password }) => {
  const { normalizedEmail, normalizedPassword } = validateCredentials({
    email,
    password,
  });
  validatePasswordStrength(normalizedPassword);

  const normalizedName = typeof name === "string" ? name.trim() : "";
  const passwordHash = await bcrypt.hash(normalizedPassword, 10);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  try {
    const result = await dbQuery(
      `
        INSERT INTO users (name, email, password_hash, trial_ends_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email
      `,
      [normalizedName, normalizedEmail, passwordHash, trialEndsAt.toISOString()],
    );

    return createAuthResult(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      throw createError(409, "Usuario ja cadastrado.");
    }

    throw error;
  }
};

export const loginUser = async ({ email, password }) => {
  const { normalizedEmail, normalizedPassword } = validateCredentials({
    email,
    password,
  });

  const result = await dbQuery(
    `
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  if (result.rows.length === 0) {
    throw createError(401, "Credenciais invalidas.");
  }

  const user = result.rows[0];

  if (!user.password_hash) {
    throw createError(401, "Credenciais invalidas.");
  }

  const passwordMatches = await bcrypt.compare(
    normalizedPassword,
    user.password_hash,
  );

  if (!passwordMatches) {
    throw createError(401, "Credenciais invalidas.");
  }

  return createAuthResult(user);
};

export const verifyAuthToken = (token) => jwt.verify(token, getJwtSecret());

export const setUserPassword = async ({
  userId,
  currentPassword,
  newPassword,
} = {}) => {
  const normalizedNew =
    typeof newPassword === "string" ? newPassword.trim() : "";
  if (!normalizedNew) {
    throw createError(400, "Nova senha e obrigatoria.");
  }
  validatePasswordStrength(normalizedNew);

  const result = await dbQuery(
    `SELECT id, email, password_hash FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Usuario nao encontrado.");
  }

  const user = result.rows[0];

  if (user.password_hash) {
    const normalizedCurrent =
      typeof currentPassword === "string" ? currentPassword.trim() : "";
    if (!normalizedCurrent) {
      throw createError(400, "Senha atual e obrigatoria.");
    }
    const matches = await bcrypt.compare(normalizedCurrent, user.password_hash);
    if (!matches) {
      throw createError(401, "Senha atual incorreta.");
    }
  }

  const newHash = await bcrypt.hash(normalizedNew, 10);
  await dbQuery(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
    newHash,
    userId,
  ]);
};

export const linkGoogleIdentity = async ({ userId, idToken } = {}) => {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw createError(400, "Token Google ausente ou invalido.");
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(idToken.trim());
  } catch (error) {
    if (error.status) throw error;
    throw createError(401, "Falha ao verificar token Google.");
  }

  const { sub: googleId, email: rawEmail } = payload;
  if (!googleId || !rawEmail) {
    throw createError(401, "Token Google invalido: dados ausentes.");
  }

  const existingResult = await dbQuery(
    `SELECT user_id FROM user_identities
     WHERE provider = 'google' AND provider_id = $1 LIMIT 1`,
    [googleId],
  );

  if (existingResult.rows.length > 0) {
    if (Number(existingResult.rows[0].user_id) === Number(userId)) {
      return; // Already linked to this user — idempotent
    }
    throw createError(
      409,
      "Esta conta Google ja esta vinculada a outro usuario.",
    );
  }

  const email = getNormalizedEmail(rawEmail);
  await dbQuery(
    `INSERT INTO user_identities (user_id, provider, provider_id, email)
     VALUES ($1, 'google', $2, $3)`,
    [userId, googleId, email],
  );
};

const verifyGoogleIdToken = async (idToken) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();

  if (!payload) {
    throw createError(401, "Token Google invalido.");
  }

  return payload;
};

export const loginOrRegisterWithGoogle = async ({ idToken } = {}) => {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw createError(400, "Token Google ausente ou invalido.");
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(idToken.trim());
  } catch (error) {
    if (error.status) throw error;
    throw createError(401, "Falha ao verificar token Google.");
  }

  const { sub: googleId, email: rawEmail, name: rawName = "" } = payload;

  if (!googleId || !rawEmail) {
    throw createError(401, "Token Google invalido: dados ausentes.");
  }

  const email = getNormalizedEmail(rawEmail);
  const name = typeof rawName === "string" ? rawName.trim() : "";

  // 1. Identity already linked → return existing user
  const identityResult = await dbQuery(
    `SELECT u.id, u.name, u.email
     FROM user_identities ui
     JOIN users u ON u.id = ui.user_id
     WHERE ui.provider = 'google' AND ui.provider_id = $1
     LIMIT 1`,
    [googleId],
  );

  if (identityResult.rows.length > 0) {
    return createAuthResult(identityResult.rows[0]);
  }

  // 2. Email already in users → link identity to existing account
  const userResult = await dbQuery(
    `SELECT id, name, email FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );

  let user;
  if (userResult.rows.length > 0) {
    user = userResult.rows[0];
  } else {
    // 3. New user — create without password
    const googleTrialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const newUserResult = await dbQuery(
      `INSERT INTO users (name, email, trial_ends_at) VALUES ($1, $2, $3) RETURNING id, name, email`,
      [name, email, googleTrialEndsAt.toISOString()],
    );
    user = newUserResult.rows[0];
  }

  await dbQuery(
    `INSERT INTO user_identities (user_id, provider, provider_id, email)
     VALUES ($1, 'google', $2, $3)`,
    [user.id, googleId, email],
  );

  return createAuthResult(user);
};
