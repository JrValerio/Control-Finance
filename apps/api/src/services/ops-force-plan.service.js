import { withDbTransaction } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizePlan = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const forcePlanForEmail = async ({ email, plan } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPlan = normalizePlan(plan);

  if (!normalizedEmail) {
    throw createError(422, "email e obrigatorio.");
  }

  if (normalizedPlan !== "pro") {
    throw createError(422, "plan deve ser 'pro'.");
  }

  return withDbTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail],
    );

    if (userResult.rows.length === 0) {
      throw createError(404, "Usuario nao encontrado.");
    }

    const user = userResult.rows[0];

    const planResult = await client.query(
      `SELECT id, name FROM plans WHERE name = $1 AND is_active = true LIMIT 1`,
      [normalizedPlan],
    );

    if (planResult.rows.length === 0) {
      throw createError(404, "Plano nao encontrado.");
    }

    const planRow = planResult.rows[0];

    await client.query(
      `UPDATE subscriptions
       SET status = 'canceled',
           cancel_at_period_end = false,
           updated_at = NOW()
       WHERE user_id = $1
         AND status IN ('active', 'trialing', 'past_due')`,
      [user.id],
    );

    await client.query(
      `INSERT INTO subscriptions
        (user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '30 days', false)`,
      [user.id, planRow.id],
    );

    return {
      email: user.email,
      plan: planRow.name,
      status: "active",
    };
  });
};

