import { dbQuery } from "../db/index.js";
import { calculateNetSalary } from "../domain/salary/salary.calculator.js";

const PAYMENT_DAY_MIN = 1;
const PAYMENT_DAY_MAX = 31;

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

// ─── Validation ───────────────────────────────────────────────────────────────

const validateInput = ({ grossSalary, dependents, paymentDay }) => {
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
};

// ─── Shape ────────────────────────────────────────────────────────────────────

const toProfile = (row) => ({
  id:           Number(row.id),
  userId:       Number(row.user_id),
  grossSalary:  toMoney(row.gross_salary),
  dependents:   Number(row.dependents),
  paymentDay:   Number(row.payment_day),
  createdAt:    row.created_at,
  updatedAt:    row.updated_at,
});

const withCalculation = (profile) => ({
  ...profile,
  calculation: calculateNetSalary({
    grossSalary: profile.grossSalary,
    dependents:  profile.dependents,
  }),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

const FIND_SQL = `
  SELECT id, user_id, gross_salary, dependents, payment_day, created_at, updated_at
  FROM salary_profiles
  WHERE user_id = $1
  LIMIT 1
`;

const INSERT_SQL = `
  INSERT INTO salary_profiles (user_id, gross_salary, dependents, payment_day)
  VALUES ($1, $2, $3, $4)
  RETURNING id, user_id, gross_salary, dependents, payment_day, created_at, updated_at
`;

const UPDATE_SQL = `
  UPDATE salary_profiles
  SET gross_salary = $1,
      dependents   = $2,
      payment_day  = $3,
      updated_at   = NOW()
  WHERE user_id = $4
  RETURNING id, user_id, gross_salary, dependents, payment_day, created_at, updated_at
`;

// ─── Public API ───────────────────────────────────────────────────────────────

export const getSalaryProfileForUser = async (userId) => {
  const result = await dbQuery(FIND_SQL, [userId]);
  if (!result.rows[0]) {
    throw createError(404, "Perfil salarial não encontrado.");
  }
  return withCalculation(toProfile(result.rows[0]));
};

export const upsertSalaryProfileForUser = async (userId, body = {}) => {
  const {
    gross_salary: grossSalary,
    dependents = 0,
    payment_day: paymentDay = 5,
  } = body;

  validateInput({ grossSalary, dependents, paymentDay });

  const gross = Number(grossSalary);
  const dep   = Number(dependents);
  const day   = Number(paymentDay);

  const existing = await dbQuery(FIND_SQL, [userId]);
  let result;

  if (existing.rows[0]) {
    result = await dbQuery(UPDATE_SQL, [gross, dep, day, userId]);
  } else {
    result = await dbQuery(INSERT_SQL, [userId, gross, dep, day]);
  }

  return withCalculation(toProfile(result.rows[0]));
};
