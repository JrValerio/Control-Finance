import { dbQuery } from "../db/index.js";
import { calculateNetBenefit } from "../domain/salary/benefit.calculator.js";
import { calculateNetSalary } from "../domain/salary/salary.calculator.js";

const PAYMENT_DAY_MIN = 1;
const PAYMENT_DAY_MAX = 31;
const CONSIGNACAO_DESCRIPTION_MAX_LENGTH = 100;

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

// ─── Validation ───────────────────────────────────────────────────────────────

const validateProfileInput = ({ grossSalary, dependents, paymentDay, profileType, birthYear }) => {
  if (grossSalary === undefined || grossSalary === null) {
    throw createError(422, "gross_salary é obrigatório.");
  }
  const gross = Number(grossSalary);
  if (!Number.isFinite(gross) || gross <= 0) {
    throw createError(422, "gross_salary deve ser um número positivo.");
  }

  if (dependents !== undefined && dependents !== null) {
    const dep = Number(dependents);
    if (!Number.isInteger(dep) || dep < 0) {
      throw createError(422, "dependents deve ser um inteiro não negativo.");
    }
  }

  if (paymentDay !== undefined && paymentDay !== null) {
    const day = Number(paymentDay);
    if (
      !Number.isInteger(day) ||
      day < PAYMENT_DAY_MIN ||
      day > PAYMENT_DAY_MAX
    ) {
      throw createError(
        422,
        `payment_day deve ser um inteiro entre ${PAYMENT_DAY_MIN} e ${PAYMENT_DAY_MAX}.`,
      );
    }
  }

  if (profileType !== undefined && profileType !== null) {
    if (!["clt", "inss_beneficiary"].includes(profileType)) {
      throw createError(422, "profile_type deve ser 'clt' ou 'inss_beneficiary'.");
    }
  }

  if (birthYear !== undefined && birthYear !== null) {
    const year = Number(birthYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw createError(422, "birth_year deve ser um ano válido.");
    }
  }
};

const validateConsignacaoInput = ({ description, amount, consignacaoType }) => {
  if (!description || !String(description).trim()) {
    throw createError(422, "description é obrigatório.");
  }
  if (String(description).trim().length > CONSIGNACAO_DESCRIPTION_MAX_LENGTH) {
    throw createError(
      422,
      `description deve ter no máximo ${CONSIGNACAO_DESCRIPTION_MAX_LENGTH} caracteres.`,
    );
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw createError(422, "amount deve ser um número positivo.");
  }
  if (!["loan", "card", "other"].includes(consignacaoType)) {
    throw createError(422, "consignacao_type deve ser 'loan', 'card' ou 'other'.");
  }
};

// ─── Shapers ──────────────────────────────────────────────────────────────────

const toProfile = (row) => ({
  id:          Number(row.id),
  userId:      Number(row.user_id),
  profileType: row.profile_type ?? "clt",
  birthYear:   row.birth_year != null ? Number(row.birth_year) : null,
  grossSalary: toMoney(row.gross_salary),
  dependents:  Number(row.dependents),
  paymentDay:  Number(row.payment_day),
  createdAt:   row.created_at,
  updatedAt:   row.updated_at,
});

const toConsignacao = (row) => ({
  id:               Number(row.id),
  salaryProfileId:  Number(row.salary_profile_id),
  description:      row.description,
  amount:           toMoney(row.amount),
  consignacaoType:  row.consignacao_type,
  createdAt:        row.created_at,
});

const assertBeneficiaryProfile = (profile) => {
  if (profile.profileType !== "inss_beneficiary") {
    throw createError(
      422,
      "Consignações só podem ser usadas com profile_type 'inss_beneficiary'.",
    );
  }
};

const withCalculation = (profile, consignacoes = []) => {
  let calculation;

  if (profile.profileType === "inss_beneficiary") {
    calculation = calculateNetBenefit({
      grossBenefit: profile.grossSalary,
      birthYear:    profile.birthYear,
      dependents:   profile.dependents,
      consignacoes,
    });
  } else {
    calculation = calculateNetSalary({
      grossSalary: profile.grossSalary,
      dependents:  profile.dependents,
    });
  }

  return { ...profile, consignacoes, calculation };
};

// ─── SQL ──────────────────────────────────────────────────────────────────────

const FIND_SQL = `
  SELECT id, user_id, gross_salary, dependents, payment_day, profile_type, birth_year,
         created_at, updated_at
  FROM   salary_profiles
  WHERE  user_id = $1
  LIMIT  1
`;

const FIND_CONSIGNACOES_SQL = `
  SELECT id, salary_profile_id, description, amount, consignacao_type, created_at
  FROM   salary_consignacoes
  WHERE  salary_profile_id = $1
  ORDER  BY created_at ASC
`;

const INSERT_SQL = `
  INSERT INTO salary_profiles
    (user_id, gross_salary, dependents, payment_day, profile_type, birth_year)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id, user_id, gross_salary, dependents, payment_day, profile_type, birth_year,
            created_at, updated_at
`;

const UPDATE_SQL = `
  UPDATE salary_profiles
  SET gross_salary = $1,
      dependents   = $2,
      payment_day  = $3,
      profile_type = $4,
      birth_year   = $5,
      updated_at   = NOW()
  WHERE user_id = $6
  RETURNING id, user_id, gross_salary, dependents, payment_day, profile_type, birth_year,
            created_at, updated_at
`;

const INSERT_CONSIGNACAO_SQL = `
  INSERT INTO salary_consignacoes
    (salary_profile_id, description, amount, consignacao_type)
  VALUES ($1, $2, $3, $4)
  RETURNING id, salary_profile_id, description, amount, consignacao_type, created_at
`;

// ─── Public API ───────────────────────────────────────────────────────────────

export const getSalaryProfileForUser = async (userId) => {
  const result = await dbQuery(FIND_SQL, [userId]);
  if (!result.rows[0]) {
    throw createError(404, "Perfil salarial não encontrado.");
  }
  const profile = toProfile(result.rows[0]);
  const consigRows = await dbQuery(FIND_CONSIGNACOES_SQL, [profile.id]);
  const consignacoes = consigRows.rows.map(toConsignacao);
  return withCalculation(profile, consignacoes);
};

export const upsertSalaryProfileForUser = async (userId, body = {}) => {
  const {
    gross_salary:  grossSalary,
    dependents     = 0,
    payment_day:   paymentDay = 5,
    profile_type:  profileType = "clt",
    birth_year:    birthYear = null,
  } = body;

  validateProfileInput({ grossSalary, dependents, paymentDay, profileType, birthYear });

  const gross = Number(grossSalary);
  const dep   = Number(dependents);
  const day   = Number(paymentDay);
  const type  = profileType;
  const year  = birthYear != null ? Number(birthYear) : null;

  const existing = await dbQuery(FIND_SQL, [userId]);
  let result;

  if (existing.rows[0]) {
    result = await dbQuery(UPDATE_SQL, [gross, dep, day, type, year, userId]);
  } else {
    result = await dbQuery(INSERT_SQL, [userId, gross, dep, day, type, year]);
  }

  const profile = toProfile(result.rows[0]);
  const consigRows = await dbQuery(FIND_CONSIGNACOES_SQL, [profile.id]);
  const consignacoes = consigRows.rows.map(toConsignacao);
  return withCalculation(profile, consignacoes);
};

export const addConsignacaoForUser = async (userId, body = {}) => {
  const {
    description,
    amount,
    consignacao_type: consignacaoType,
  } = body;

  validateConsignacaoInput({ description, amount, consignacaoType });

  // Ensure profile exists and get its id
  const profileResult = await dbQuery(FIND_SQL, [userId]);
  if (!profileResult.rows[0]) {
    throw createError(404, "Perfil salarial não encontrado.");
  }
  const profile = toProfile(profileResult.rows[0]);
  assertBeneficiaryProfile(profile);
  const profileId = profile.id;

  const result = await dbQuery(INSERT_CONSIGNACAO_SQL, [
    profileId,
    String(description).trim(),
    Number(amount),
    consignacaoType,
  ]);

  return toConsignacao(result.rows[0]);
};

export const deleteConsignacaoForUser = async (userId, consignacaoId) => {
  // Resolve profile id for ownership check
  const profileResult = await dbQuery(FIND_SQL, [userId]);
  if (!profileResult.rows[0]) {
    throw createError(404, "Perfil salarial não encontrado.");
  }
  const profileId = Number(profileResult.rows[0].id);

  const result = await dbQuery(
    `DELETE FROM salary_consignacoes WHERE id = $1 AND salary_profile_id = $2 RETURNING id`,
    [consignacaoId, profileId],
  );

  if (!result.rows[0]) {
    throw createError(404, "Consignação não encontrada.");
  }
};
