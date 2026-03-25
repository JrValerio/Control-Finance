import Anthropic from "@anthropic-ai/sdk";
import { getLatestForecast } from "./forecast.service.js";
import { dbQuery } from "../db/index.js";
import { logInfo, logWarn, logError } from "../observability/logger.js";

const SYSTEM_PROMPT =
  "Você é o Especialista Financeiro do app Control Finance. Analise os dados JSON fornecidos e retorne um único insight acionável de no máximo 180 caracteres. Seja pragmático. Se os dados forem positivos, parabenize e sugira uma meta de reserva. Se forem negativos, aponte a categoria culpada e sugira um corte específico. Retorne APENAS o texto do insight, sem formatação, sem aspas, sem JSON.";

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

  const topCategories = await getTopExpenseCategories(userId, now);

  const context = {
    balance: forecast.adjustedProjectedBalance,
    burn_rate: forecast.dailyAvgSpending,
    runway: forecast.daysRemaining,
    health_score: forecast.adjustedProjectedBalance > 0 ? "positive" : "negative",
    top_categories: topCategories,
  };

  const client = anthropicClient ?? new Anthropic();

  let insightText;
  const callStart = Date.now();
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
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
