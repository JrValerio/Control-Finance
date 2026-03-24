import { normalizeCategoryNameKey } from "../../services/categories-normalization.js";

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const CATEGORY_GROUPS = [
  {
    aliases: ["transporte", "mobilidade", "combustivel", "locomocao"],
    keywords: [
      "uber",
      "99",
      "taxi",
      "autopass",
      "top sp",
      "metro",
      "buson",
      "posto",
      "ipiranga",
      "shell",
      "ale combustiveis",
      "estacionamento",
    ],
    types: ["Saida"],
  },
  {
    aliases: ["alimentacao", "mercado", "supermercado", "restaurante", "delivery"],
    keywords: [
      "ifood",
      "mercado",
      "supermercado",
      "restaurante",
      "padaria",
      "carrefour",
      "atacadao",
      "nagumo",
      "oxxo",
      "pao de",
      "lanche",
    ],
    types: ["Saida"],
  },
  {
    aliases: ["saude", "farmacia", "medicamentos"],
    keywords: ["raia", "drogaria", "droga", "farmacia", "medic"],
    types: ["Saida"],
  },
  {
    aliases: ["moradia", "casa", "contas", "servicos", "utilities"],
    keywords: ["neoenergia", "sabesp", "enel", "tim", "claro", "vivo", "embratel", "energia"],
    types: ["Saida"],
  },
  {
    aliases: ["salario", "renda", "beneficios", "beneficio", "receitas", "recebimentos", "clientes"],
    keywords: ["salario", "pgto inss", "credito inss", "deposito", "recebimento", "cliente"],
    types: ["Entrada"],
  },
];

const scoreCategoryAgainstGroup = (categoryKey, group, description, type) => {
  if (Array.isArray(group.types) && !group.types.includes(type)) {
    return 0;
  }

  const aliasMatched = group.aliases.some((alias) => categoryKey === normalizeCategoryNameKey(alias));
  if (!aliasMatched) {
    return 0;
  }

  const keywordMatches = group.keywords.filter((keyword) => description.includes(keyword)).length;
  return keywordMatches > 0 ? 3 + keywordMatches : 0;
};

export const suggestCategoryNameForImportedRow = (rawRow, categories = []) => {
  if (!rawRow || rawRow.category) {
    return rawRow?.category || "";
  }

  const description = normalizeText(`${rawRow.description || ""} ${rawRow.notes || ""}`);
  const type = String(rawRow.type || "").trim();

  if (!description || !type) {
    return "";
  }

  let bestCandidate = null;

  categories.forEach((category) => {
    const categoryName = String(category?.name || "").trim();
    const categoryKey = normalizeCategoryNameKey(categoryName);

    if (!categoryName || !categoryKey) {
      return;
    }

    let score = 0;

    if (categoryKey.length >= 4 && description.includes(categoryKey)) {
      score += 2;
    }

    CATEGORY_GROUPS.forEach((group) => {
      score += scoreCategoryAgainstGroup(categoryKey, group, description, type);
    });

    if (score <= 0) {
      return;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { name: categoryName, score, tied: false };
      return;
    }

    if (bestCandidate && score === bestCandidate.score && bestCandidate.name !== categoryName) {
      bestCandidate.tied = true;
    }
  });

  if (!bestCandidate || bestCandidate.tied) {
    return "";
  }

  return bestCandidate.name;
};

export const applySmartClassification = (rows = [], categories = []) =>
  rows.map((row) => {
    const suggestedCategoryName = suggestCategoryNameForImportedRow(row.raw, categories);

    if (!suggestedCategoryName) {
      return row;
    }

    return {
      ...row,
      raw: {
        ...row.raw,
        category: suggestedCategoryName,
      },
    };
  });
