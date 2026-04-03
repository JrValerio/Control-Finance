import Anthropic from "@anthropic-ai/sdk";
import { getLatestForecast } from "./forecast.service.ts";
import { getGoalsSummaryForAI } from "./goals.service.js";
import { listBankAccountsByUser } from "./bank-accounts.service.js";
import { getUtilityBillsPanelForUser } from "./bills.service.js";
import { dbQuery } from "../db/index.js";
import { logInfo, logWarn, logError } from "../observability/logger.js";

const SYSTEM_PROMPTS = {
  pragmatic:
    "Você é o Especialista Financeiro do app Control Finance. Analise os dados JSON e retorne um único insight acionável de no máximo 180 caracteres. Prioridade: se alguma meta tiver monthly_needed maior que o balance, alerte que o plano está inviável e sugira qual gasto cortar. Se os dados forem negativos sem metas, aponte a categoria culpada. Se forem positivos, parabenize e reforce a meta mais próxima do prazo. Retorne APENAS o texto do insight, sem formatação, sem aspas, sem JSON.",
  motivator:
    "Você é o Especialista Financeiro do app Control Finance, com estilo encorajador. Analise os dados JSON e retorne um único insight de no máximo 180 caracteres que celebre progresso e enquadre desafios como oportunidades. Se alguma meta estiver em risco, incentive a mudança com entusiasmo. Se os dados forem negativos, aponte o caminho com energia positiva. Se forem positivos, comemore e reforce a conquista. Retorne APENAS o texto do insight, sem formatação, sem aspas, sem JSON.",
  sarcastic:
    "Você é o Especialista Financeiro do app Control Finance, com estilo levemente sarcástico. Analise os dados JSON e retorne um único insight de no máximo 180 caracteres. Se alguma meta estiver em risco, comente com ironia sobre o gasto culpado. Se os dados forem negativos, seja direto com humor ácido. Se forem positivos, parabenize — mas com leve surpresa. Retorne APENAS o texto do insight, sem formatação, sem aspas, sem JSON.",
};

const monthStartStr = (now) => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

const monthEndStr = (now) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return d.toISOString().slice(0, 10);
};

const getTopExpenseCategories = async (userId, now = new Date()) => {
  const result = await dbQuery(
    `SELECT
       MIN(c.name) AS category_name,
       COALESCE(SUM(t.value), 0)::numeric AS expense
     FROM transactions t
     LEFT JOIN categories c
       ON c.id = t.category_id
      AND c.user_id = $1
     WHERE t.user_id = $1
       AND t.deleted_at IS NULL
       AND t.type = 'Saida'
       AND t.date >= $2
       AND t.date <= $3
     GROUP BY t.category_id
     ORDER BY expense DESC
     LIMIT 3`,
    [userId, monthStartStr(now), monthEndStr(now)],
  );

  return result.rows.map((r) => ({
    name: r.category_name || "Sem categoria",
    expense: Number(r.expense),
  }));
};

const getAiPreferences = async (userId) => {
  const result = await dbQuery(
    `SELECT ai_tone, ai_insight_frequency FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    aiTone: row?.ai_tone ?? "pragmatic",
    aiInsightFrequency: row?.ai_insight_frequency ?? "always",
  };
};

const resolveInsightType = (adjustedBalance, incomeExpected) => {
  if (adjustedBalance <= 0) return "warning";
  const pct = incomeExpected != null && incomeExpected > 0
    ? (adjustedBalance / incomeExpected) * 100
    : null;
  if (pct !== null && pct < 15) return "info";
  return "success";
};

/**
 * Generates a Claude Haiku financial insight for the given user.
 * Returns null when no forecast exists, daysRemaining <= 0, or the LLM call fails.
 *
 * @param {number} userId
 * @param {{ now?: Date, anthropicClient?: Anthropic }} options
 */
export const generateFinancialInsight = async (userId, { now = new Date(), anthropicClient } = {}) => {
  const forecast = await getLatestForecast(userId, { now });
  if (!forecast || forecast.daysRemaining <= 0) return null;

  const [topCategories, goals, { aiTone, aiInsightFrequency }] = await Promise.all([
    getTopExpenseCategories(userId, now),
    getGoalsSummaryForAI(userId, { now }),
    getAiPreferences(userId),
  ]);

  // Early exit: skip LLM call when user only wants risk alerts and forecast is healthy
  const previewType = resolveInsightType(forecast.adjustedProjectedBalance, forecast.incomeExpected);
  if (aiInsightFrequency === "risk_only" && previewType === "success") return null;

  const context = {
    balance: forecast.adjustedProjectedBalance,
    burn_rate: forecast.dailyAvgSpending,
    runway: forecast.daysRemaining,
    health_score: forecast.adjustedProjectedBalance > 0 ? "positive" : "negative",
    top_categories: topCategories,
    goals,
  };

  const client = anthropicClient ?? new Anthropic();
  const systemPrompt = SYSTEM_PROMPTS[aiTone] ?? SYSTEM_PROMPTS.pragmatic;

  let insightText;
  const callStart = Date.now();
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    insightText = response.content[0]?.text?.trim() || null;
  } catch (error) {
    logError({
      event: "ai.insight.llm_error",
      userId,
      errorMessage: error?.message || "unknown",
      latencyMs: Date.now() - callStart,
    });
    return null;
  }

  if (!insightText) {
    logWarn({ event: "ai.insight.empty_response", userId, latencyMs: Date.now() - callStart });
    return null;
  }

  const type = resolveInsightType(forecast.adjustedProjectedBalance, forecast.incomeExpected);

  logInfo({
    event: "ai.insight.generated",
    userId,
    type,
    charCount: insightText.length,
    latencyMs: Date.now() - callStart,
  });

  return {
    id: `insight_${userId}_${Date.now()}`,
    type,
    title: "Dica do Especialista",
    message: insightText,
    action_label: "Ver detalhes",
  };
};

// ─── Bank Account Insight ───────────────────────────────────────────────────

const BANK_RISK_LABELS = { critical: "no limite", warning: "pressionada", success: "saudável" };

const BANK_INSIGHT_SYSTEM =
  "Você é o Especialista Financeiro do app Control Finance. Analise a situação da conta corrente e retorne UMA frase de no máximo 160 caracteres explicando o que o usuário deve saber agora. Seja direto e prático, sem jargão. Retorne APENAS o texto, sem formatação, sem aspas, sem JSON.";

const classifyBankRisk = (summary, accounts) => {
  if (summary.totalLimitTotal <= 0 && summary.totalBalance < 0) return "critical";
  if (accounts.some((a) => a.limitTotal > 0 && a.limitUsed >= a.limitTotal)) return "critical";
  if (summary.totalLimitUsed > 0 || summary.totalBalance < 0) return "warning";
  return "success";
};

/**
 * Generates a Claude Haiku insight for the user's bank account situation.
 * Returns null when there are no accounts or the LLM call fails.
 *
 * @param {number} userId
 * @param {{ anthropicClient?: Anthropic }} options
 */
export const generateBankAccountInsight = async (userId, { anthropicClient } = {}) => {
  const { accounts, summary } = await listBankAccountsByUser(userId);
  if (!accounts.length) return null;

  const riskLevel = classifyBankRisk(summary, accounts);

  const context = {
    accounts_count: summary.accountsCount,
    risk_level: riskLevel,
    total_balance_positive: summary.totalBalance >= 0,
    using_limit: summary.totalLimitUsed > 0,
    limit_pressure_pct:
      summary.totalLimitTotal > 0
        ? Math.round((summary.totalLimitUsed / summary.totalLimitTotal) * 100)
        : 0,
    any_account_at_limit: accounts.some((a) => a.limitTotal > 0 && a.limitUsed >= a.limitTotal),
  };

  const client = anthropicClient ?? new Anthropic();
  let message;
  const callStart = Date.now();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: BANK_INSIGHT_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    message = response.content[0]?.text?.trim() || null;
  } catch (error) {
    logError({
      event: "ai.bank_insight.llm_error",
      userId,
      errorMessage: error?.message || "unknown",
      latencyMs: Date.now() - callStart,
    });
    return null;
  }

  if (!message) {
    logWarn({ event: "ai.bank_insight.empty_response", userId, latencyMs: Date.now() - callStart });
    return null;
  }

  logInfo({
    event: "ai.bank_insight.generated",
    userId,
    riskLevel,
    charCount: message.length,
    latencyMs: Date.now() - callStart,
  });

  return {
    riskLabel: BANK_RISK_LABELS[riskLevel],
    type: riskLevel,
    message,
  };
};

// ─── Utility Bills Insight ──────────────────────────────────────────────────

const UTILITY_INSIGHT_SYSTEM =
  "Você é o Especialista Financeiro do app Control Finance. Analise o painel de contas de consumo (água, energia, internet, telefone, TV, gás) e retorne UMA frase de no máximo 160 caracteres dizendo o que o usuário deve fazer agora. Priorize o que está vencido. Seja direto. Retorne APENAS o texto, sem formatação, sem aspas, sem JSON.";

const classifyUtilityRisk = (summary) => {
  if (summary.overdueCount > 0) return "critical";
  if (summary.dueSoonCount > 0) return "warning";
  return "success";
};

const UTILITY_RISK_LABELS = {
  critical: "contas vencidas",
  warning: "vence em breve",
  success: "em dia",
};

/**
 * Generates a Claude Haiku insight for the user's utility bills.
 * Returns null when there are no pending utility bills or the LLM call fails.
 *
 * @param {number} userId
 * @param {{ anthropicClient?: Anthropic }} options
 */
export const generateUtilityInsight = async (userId, { anthropicClient } = {}) => {
  const panel = await getUtilityBillsPanelForUser(userId);
  if (panel.summary.totalPending === 0) return null;

  const riskLevel = classifyUtilityRisk(panel.summary);

  const context = {
    total_pending: panel.summary.totalPending,
    overdue_count: panel.summary.overdueCount,
    due_soon_count: panel.summary.dueSoonCount,
    upcoming_count: panel.upcoming.length,
    has_overdue: panel.summary.overdueCount > 0,
    has_due_soon: panel.summary.dueSoonCount > 0,
    types_present: [...new Set(
      [...panel.overdue, ...panel.dueSoon, ...panel.upcoming].map((b) => b.billType).filter(Boolean)
    )],
  };

  const client = anthropicClient ?? new Anthropic();
  let message;
  const callStart = Date.now();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: UTILITY_INSIGHT_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    message = response.content[0]?.text?.trim() || null;
  } catch (error) {
    logError({
      event: "ai.utility_insight.llm_error",
      userId,
      errorMessage: error?.message || "unknown",
      latencyMs: Date.now() - callStart,
    });
    return null;
  }

  if (!message) {
    logWarn({ event: "ai.utility_insight.empty_response", userId, latencyMs: Date.now() - callStart });
    return null;
  }

  logInfo({
    event: "ai.utility_insight.generated",
    userId,
    riskLevel,
    charCount: message.length,
    latencyMs: Date.now() - callStart,
  });

  return {
    riskLabel: UTILITY_RISK_LABELS[riskLevel],
    type: riskLevel,
    message,
  };
};
