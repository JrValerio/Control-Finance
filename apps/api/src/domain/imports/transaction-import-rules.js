import { normalizeCategoryNameKey } from "../../services/categories-normalization.js";

const normalizeRuleText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeSearchableText = (rawRow) =>
  normalizeCategoryNameKey(`${rawRow?.description || ""} ${rawRow?.notes || ""}`);

const pickBestMatchingRule = (rawRow, rules = []) => {
  const rowType = String(rawRow?.type || "").trim();
  const searchableText = normalizeSearchableText(rawRow);

  if (!searchableText) {
    return null;
  }

  return rules
    .filter((rule) => {
      if (!rule?.normalizedMatchText) {
        return false;
      }

      if (rule.transactionType && rule.transactionType !== rowType) {
        return false;
      }

      return searchableText.includes(rule.normalizedMatchText);
    })
    .sort((leftRule, rightRule) => {
      const patternLengthDelta =
        String(rightRule.normalizedMatchText || "").length -
        String(leftRule.normalizedMatchText || "").length;

      if (patternLengthDelta !== 0) {
        return patternLengthDelta;
      }

      return Number(rightRule.id || 0) - Number(leftRule.id || 0);
    })[0] || null;
};

export const applyTransactionImportCategoryRules = (rows = [], rules = []) =>
  rows.map((row) => {
    if (!row?.raw || row.raw.category) {
      return row;
    }

    const matchingRule = pickBestMatchingRule(row.raw, rules);

    if (!matchingRule?.categoryName) {
      return row;
    }

    return {
      ...row,
      raw: {
        ...row.raw,
        category: matchingRule.categoryName,
      },
    };
  });

export const normalizeTransactionImportRuleMatchText = (value) => {
  const normalizedValue = normalizeRuleText(value);

  if (normalizedValue.length < 2) {
    const error = new Error("Regra invalida. Informe ao menos 2 caracteres.");
    error.status = 400;
    throw error;
  }

  return normalizedValue;
};
