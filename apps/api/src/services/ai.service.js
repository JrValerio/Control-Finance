import Anthropic from "@anthropic-ai/sdk";
import { getLatestForecast } from "./forecast.service.js";
import { getGoalsSummaryForAI } from "./goals.service.js";
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
