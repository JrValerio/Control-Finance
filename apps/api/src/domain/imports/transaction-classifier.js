import { normalizeCategoryNameKey } from "../../services/categories-normalization.js";

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const DIRECT_CATEGORY_SCORE = 2;
const GROUP_MATCH_BONUS = 3;
const GROUP_KEYWORD_SCORE = 1;

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

const addCategoryToIndex = (index, keyword, categoryName) => {
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword || !categoryName) {
    return;
  }

  const existingBucket = index.get(normalizedKeyword);

  if (!existingBucket) {
    index.set(normalizedKeyword, [categoryName]);
    return;
  }

  if (!existingBucket.includes(categoryName)) {
    existingBucket.push(categoryName);
  }
};

const findCategoryGroup = (categoryKey) =>
  CATEGORY_GROUPS.find((group) =>
    group.aliases.some((alias) => categoryKey === normalizeCategoryNameKey(alias))
  ) || null;

export const createClassificationIndex = (categories = []) => {
  const directCategoryMap = new Map();
  const keywordMapsByType = new Map([
    ["Entrada", new Map()],
    ["Saida", new Map()],
  ]);

  categories.forEach((category) => {
    const categoryName = String(category?.name || "").trim();
    const categoryKey = normalizeCategoryNameKey(categoryName);

    if (!categoryName || !categoryKey) {
      return;
    }

    if (categoryKey.length >= 4) {
      addCategoryToIndex(directCategoryMap, categoryKey, categoryName);
    }

    const matchingGroup = findCategoryGroup(categoryKey);

    if (!matchingGroup) {
      return;
    }

    (matchingGroup.types || []).forEach((type) => {
      const typeKeywordMap = keywordMapsByType.get(type);

      if (!typeKeywordMap) {
        return;
      }

      matchingGroup.keywords.forEach((keyword) => {
        addCategoryToIndex(typeKeywordMap, keyword, categoryName);
      });
    });
  });

  return {
    directCategoryMap,
    keywordMapsByType,
  };
};

const addScore = (scoreMap, categoryName, amount) => {
  scoreMap.set(categoryName, (scoreMap.get(categoryName) || 0) + amount);
};

const findBestCandidate = (scoreMap) => {
  let bestCandidate = null;

  scoreMap.forEach((score, name) => {
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { name, score, tied: false };
      return;
    }

    if (bestCandidate && score === bestCandidate.score && bestCandidate.name !== name) {
      bestCandidate.tied = true;
    }
  });

  if (!bestCandidate || bestCandidate.tied) {
    return "";
  }

  return bestCandidate.name;
};

export const suggestCategoryNameForImportedRow = (rawRow, categoriesOrIndex = []) => {
  if (!rawRow || rawRow.category) {
    return rawRow?.category || "";
  }

  const description = normalizeText(`${rawRow.description || ""} ${rawRow.notes || ""}`);
  const type = String(rawRow.type || "").trim();

  if (!description || !type) {
    return "";
  }

  const classificationIndex = Array.isArray(categoriesOrIndex)
    ? createClassificationIndex(categoriesOrIndex)
    : categoriesOrIndex;
  const scoreMap = new Map();

  classificationIndex.directCategoryMap.forEach((categoryNames, keyword) => {
    if (!description.includes(keyword)) {
      return;
    }

    categoryNames.forEach((categoryName) => {
      addScore(scoreMap, categoryName, DIRECT_CATEGORY_SCORE);
    });
  });

  const keywordMap = classificationIndex.keywordMapsByType.get(type) || new Map();
  const categoriesWithKeywordHits = new Set();

  keywordMap.forEach((categoryNames, keyword) => {
    if (!description.includes(keyword)) {
      return;
    }

    categoryNames.forEach((categoryName) => {
      addScore(scoreMap, categoryName, GROUP_KEYWORD_SCORE);
      categoriesWithKeywordHits.add(categoryName);
    });
  });

  categoriesWithKeywordHits.forEach((categoryName) => {
    addScore(scoreMap, categoryName, GROUP_MATCH_BONUS);
  });

  return findBestCandidate(scoreMap);
};

export const applySmartClassification = (rows = [], categories = []) => {
  const classificationIndex = Array.isArray(categories)
    ? createClassificationIndex(categories)
    : categories;

  return rows.map((row) => {
    const suggestedCategoryName = suggestCategoryNameForImportedRow(
      row.raw,
      classificationIndex,
    );

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
};
