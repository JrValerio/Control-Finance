import {
  extractInssSuggestion,
  parseInssCreditHistoryPdfText,
} from "../imports/statement-import.js";

const EXTRACTOR_VERSION = "1.1.0";
const MAX_PREVIEW_LINES = 8;

const normalizeText = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "o")
    .toLowerCase();

const getLineEntries = (text) =>
  String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => ({
      raw,
      normalized: normalizeText(raw),
    }));

const getPreviewLines = (text, limit = MAX_PREVIEW_LINES) =>
  getLineEntries(text)
    .slice(0, limit)
    .map((entry) => entry.raw);

const parseSignedAmount = (value) => {
  const normalizedValue = String(value || "").trim().replace(/^R\$\s*/i, "");

  if (!normalizedValue) {
    return null;
  }

  const hasComma = normalizedValue.includes(",");
  const hasDot = normalizedValue.includes(".");
  let numericValue = normalizedValue;

  if (hasComma && hasDot) {
    const decimalSeparator =
      normalizedValue.lastIndexOf(",") > normalizedValue.lastIndexOf(".") ? "," : ".";

    numericValue =
      decimalSeparator === ","
        ? normalizedValue.replace(/\./g, "").replace(",", ".")
        : normalizedValue.replace(/,/g, "");
  } else if (hasComma) {
    numericValue = normalizedValue.replace(/\./g, "").replace(",", ".");
  }

  const parsedValue = Number(numericValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Number(parsedValue.toFixed(2));
};

const extractFirstMatch = (text, regex) => {
  const match = String(text || "").match(regex);
  return match ? match[1].trim() : null;
};

const extractAmountByPatterns = (text, patterns) => {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);

    if (!match) {
      continue;
    }

    const parsedAmount = parseSignedAmount(match[1]);

    if (parsedAmount !== null) {
      return Math.abs(parsedAmount);
    }
  }

  return null;
};

const buildSectionFlags = (normalizedText, descriptors) =>
  descriptors.filter((descriptor) => normalizedText.includes(descriptor));

const extractYearFromLine = (value) => {
  const yearMatch = String(value || "").match(/\b(20\d{2})\b/);
  return yearMatch ? Number(yearMatch[1]) : null;
};

const extractCalendarYear = (text) => {
  const normalizedText = normalizeText(text);
  const directMatch =
    normalizedText.match(/ano[-\s]?calendario(?:\s+de|[:\s]+)\s*(20\d{2})/i) ||
    normalizedText.match(/exercicio\s+de\s+20\d{2}\s+ano[-\s]?calendario(?:\s+de|[:\s]+)\s*(20\d{2})/i);

  if (directMatch) {
    return Number(directMatch[1]);
  }

  const lineEntries = getLineEntries(text);

  for (let index = 0; index < lineEntries.length; index += 1) {
    const entry = lineEntries[index];

    if (!entry.normalized.includes("ano calendario")) {
      continue;
    }

    const nearbyYears = [
      extractYearFromLine(entry.raw),
      extractYearFromLine(lineEntries[index - 1]?.raw),
      extractYearFromLine(lineEntries[index + 1]?.raw),
    ].filter((value) => Number.isInteger(value));

    if (nearbyYears.length > 0) {
      return nearbyYears[0];
    }
  }

  return null;
};

const extractGenericYearEndBalances = (text) => {
  const lineEntries = getLineEntries(text);
  const balances = [];

  for (const entry of lineEntries) {
    const sameLineMatch = entry.normalized.match(
      /saldo em 31\/12\/(20\d{2})(?:\s+saldo em 31\/12\/(20\d{2}))?.*?r\$\s*([\d.,]+)(?:\s+r\$\s*([\d.,]+))?/i,
    );

    if (!sameLineMatch) {
      continue;
    }

    const [, firstYear, secondYear, firstAmount, secondAmount] = sameLineMatch;
    const firstParsedAmount = parseSignedAmount(firstAmount);
    const secondParsedAmount = parseSignedAmount(secondAmount);

    if (firstParsedAmount !== null) {
      balances.push({
        date: `31/12/${firstYear}`,
        amount: firstParsedAmount,
      });
    }

    if (secondYear && secondParsedAmount !== null) {
      balances.push({
        date: `31/12/${secondYear}`,
        amount: secondParsedAmount,
      });
    }
  }

  return balances.slice(0, 4);
};

const sumAmounts = (items, selector) =>
  Number(
    (Array.isArray(items) ? items : []).reduce((total, item) => {
      const value = Number(selector(item) || 0);
      return Number.isFinite(value) ? total + value : total;
    }, 0).toFixed(2),
  );

const hasMatchingSectionTotal = (items, expectedValue, selector) => {
  if (!Number.isFinite(Number(expectedValue))) {
    return true;
  }

  return Math.abs(sumAmounts(items, selector) - Number(expectedValue)) < 0.01;
};

const parseInstitutionLine = (lineEntries, lineMatcher) => {
  const entry = lineEntries.find((item) => lineMatcher.test(item.normalized));

  if (!entry) {
    return {
      name: null,
      document: null,
    };
  }

  const match = entry.raw.match(
    /(?:fonte pagadora|credor):\s*(.+?)\s+cnpj:\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i,
  );

  if (!match) {
    return {
      name: null,
      document: null,
    };
  }

  return {
    name: match[1].trim(),
    document: match[2].trim(),
  };
};

const parseCustomerInfo = (lineEntries) => {
  const clientEntry = lineEntries.find((entry) => entry.normalized.startsWith("cliente:"));

  if (clientEntry) {
    const clientMatch = clientEntry.raw.match(
      /cliente:\s*(.+?)\s+cpf:\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i,
    );

    if (clientMatch) {
      return {
        name: clientMatch[1].trim(),
        cpf: clientMatch[2].trim(),
      };
    }
  }

  const cpfIndex = lineEntries.findIndex((entry) => entry.normalized === "cpf:");
  const nameIndex = lineEntries.findIndex((entry) => entry.normalized === "nome completo:");

  return {
    name:
      nameIndex >= 0 && lineEntries[nameIndex + 1]
        ? lineEntries[nameIndex + 1].raw
        : null,
    cpf:
      cpfIndex >= 0 && lineEntries[cpfIndex + 1]
        ? lineEntries[cpfIndex + 1].raw
        : null,
  };
};

const extractMoneyValuesFromLine = (value) => {
  const matches = String(value || "").match(/\d[\d.]*,\d{2}/g) || [];

  return matches
    .map((match) => parseSignedAmount(match))
    .filter((amount) => amount !== null);
};

const isMoneyOnlyLine = (value) => /^\d[\d.]*,\d{2}$/.test(String(value || "").trim());

const extractAmountFromMatchingLineEntries = (lineEntries, matcher) => {
  for (let index = 0; index < lineEntries.length; index += 1) {
    const entry = lineEntries[index];

    if (!matcher.test(entry.normalized)) {
      continue;
    }

    const sameLineAmounts = extractMoneyValuesFromLine(entry.raw);

    if (sameLineAmounts.length > 0) {
      return Math.abs(sameLineAmounts[sameLineAmounts.length - 1]);
    }

    const previousRaw = lineEntries[index - 1]?.raw;
    const nextRaw = lineEntries[index + 1]?.raw;
    const nextLineAmounts = extractMoneyValuesFromLine(nextRaw);

    if (nextLineAmounts.length > 0) {
      return Math.abs(nextLineAmounts[nextLineAmounts.length - 1]);
    }

    if (isMoneyOnlyLine(previousRaw)) {
      return Math.abs(parseSignedAmount(previousRaw));
    }

    if (isMoneyOnlyLine(nextRaw)) {
      return Math.abs(parseSignedAmount(nextRaw));
    }
  }

  return null;
};

const findNextRawLineByMatcher = (lineEntries, startIndex, matcher) => {
  for (let index = Math.max(startIndex, 0); index < lineEntries.length; index += 1) {
    if (matcher.test(lineEntries[index].normalized)) {
      return lineEntries[index].raw;
    }
  }

  return null;
};

const findNextValueAfterLabel = (lineEntries, startIndex, matcher) => {
  const labelIndex = lineEntries.findIndex(
    (entry, index) => index >= Math.max(startIndex, 0) && matcher.test(entry.normalized),
  );

  if (labelIndex < 0) {
    return null;
  }

  return lineEntries[labelIndex + 1]?.raw?.trim() || null;
};

const extractAnnualInssIncomeReport = (text) => {
  const normalizedText = normalizeText(text);
  const collapsedText = normalizedText.replace(/\s+/g, " ");

  if (
    !collapsedText.includes("comprovante de rendimentos pagos e de") ||
    !collapsedText.includes("imposto sobre a renda retido na fonte")
  ) {
    return null;
  }

  const lineEntries = getLineEntries(text);
  const beneficiarySectionIndex = lineEntries.findIndex((entry) =>
    entry.normalized.includes("2 - pessoa fisica beneficiaria"),
  );
  const payerLine = lineEntries.find((entry) =>
    /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(entry.raw),
  );
  const beneficiaryLine = lineEntries.find((entry) =>
    /\d{3}\.?\d{3}\.?\d{3}-?\d{2}.+\d{8,}/.test(entry.raw),
  );
  const natureLine = lineEntries.find((entry) => /^\d{4}[-–]/.test(entry.raw));

  const payerMatch = payerLine?.raw.match(
    /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\s+(.+)/,
  );
  const beneficiaryMatch = beneficiaryLine?.raw.match(
    /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s+(.+?)\s+(\d{8,})$/,
  );
  const natureMatch = natureLine?.raw.match(/^(\d{4})[-–](.+)$/);
  const payerDocumentFallback = findNextValueAfterLabel(
    lineEntries,
    0,
    /^cnpj\/cpf:$/i,
  );
  const payerNameFallback = findNextValueAfterLabel(
    lineEntries,
    0,
    /^nome da empresa\/nome completo:$/i,
  );
  const beneficiaryDocumentFallback = findNextValueAfterLabel(
    lineEntries,
    beneficiarySectionIndex,
    /^cpf:$/i,
  );
  const beneficiaryNameFallback = findNextValueAfterLabel(
    lineEntries,
    beneficiarySectionIndex,
    /^nome completo:$/i,
  );
  const benefitNumberFallback = findNextValueAfterLabel(
    lineEntries,
    beneficiarySectionIndex,
    /^numero do beneficio:$/i,
  );
  const incomeNatureFallback = findNextValueAfterLabel(
    lineEntries,
    beneficiarySectionIndex,
    /^natureza do rendimento:$/i,
  );
  const incomeNatureFallbackMatch = incomeNatureFallback?.match(/^(\d{4})\s*[-–]\s*(.+)$/);
  const extractAnnualInssAmount = (patterns, lineMatcher) =>
    extractAmountByPatterns(normalizedText, patterns) ??
    extractAmountFromMatchingLineEntries(lineEntries, lineMatcher);

  return {
    extractorName: "income-report-inss",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportProfile: "annual",
      reportYear: extractCalendarYear(text),
      payerName: payerMatch?.[2]?.trim() || payerNameFallback || "INSS",
      payerDocument: payerMatch?.[1]?.trim() || payerDocumentFallback || null,
      beneficiaryName: beneficiaryMatch?.[2]?.trim() || beneficiaryNameFallback || null,
      beneficiaryDocument:
        beneficiaryMatch?.[1]?.trim() || beneficiaryDocumentFallback || null,
      benefitNumber: beneficiaryMatch?.[3]?.trim() || benefitNumberFallback || null,
      incomeNatureCode:
        natureMatch?.[1]?.trim() || incomeNatureFallbackMatch?.[1]?.trim() || null,
      incomeNatureDescription:
        natureMatch?.[2]?.trim() || incomeNatureFallbackMatch?.[2]?.trim() || null,
      taxableIncome: extractAnnualInssAmount(
        [
        /1\.\s*total dos rendimentos \(inclusive ferias\)\s+([\d.]*,\d{2})/i,
      ],
        /1\s*-\s*total de rendimentos \(inclusive ferias\)$/i,
      ),
      officialSocialSecurity: extractAnnualInssAmount(
        [
        /2\.\s*contribuicao previdenciaria oficial\s+([\d.]*,\d{2})/i,
      ],
        /2\s*-\s*contribuicao previdenciaria oficial$/i,
      ),
      privatePensionOrFapi: extractAnnualInssAmount(
        [
        /3\.\s*contribuicoes a entidades de previdencia complementar.*?\s+([\d.]*,\d{2})/i,
      ],
        /3\s*-\s*contribuic(?:ao|oes).+fapi\)$/i,
      ),
      alimony: extractAnnualInssAmount(
        [
        /4\.\s*pensao alimenticia.*?\s+([\d.]*,\d{2})/i,
      ],
        /4\s*-\s*pensao alimenticia/i,
      ),
      withheldTax: extractAnnualInssAmount(
        [
        /5\.\s*imposto sobre a renda retido na fonte\s+([\d.]*,\d{2})/i,
      ],
        /5\s*-\s*imposto retido na fonte$/i,
      ),
      retirement65PlusExempt: extractAnnualInssAmount(
        [
        /1\.\s*parcela isenta dos proventos de aposentadoria.*?\s+([\d.]*,\d{2})/i,
      ],
        /1\s*-\s*parcela isenta dos proventos de aposentadoria/i,
      ),
      retirement65PlusThirteenthExempt: extractAnnualInssAmount(
        [
        /2\.\s*parcela isenta do 13o salario.*?\s+([\d.]*,\d{2})/i,
      ],
        /2\.\s*parcela isenta do 13o salario/i,
      ),
      thirteenthSalary: extractAnnualInssAmount(
        [
        /1\.\s*decimo terceiro salario\s+([\d.]*,\d{2})/i,
      ],
        /1\s*-\s*decimo terceiro salario$/i,
      ),
      thirteenthWithheldTax: extractAnnualInssAmount(
        [
        /2\.\s*imposto sobre a renda retido na fonte sobre 13o salario\s+([\d.]*,\d{2})/i,
      ],
        /2\s*-\s*imposto sobre a renda retida? na fonte sobre o 13o salario$/i,
      ),
      annualSimplifiedDiscount: extractAmountByPatterns(normalizedText, [
        /desconto simplificado.*?valor anual r\$\s*([\d.]*,\d{2})/i,
      ]),
      thirteenthSimplifiedDiscount: extractAmountByPatterns(normalizedText, [
        /desconto simplificado.*?valor de 13o r\$\s*([\d.]*,\d{2})/i,
      ]),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractLegacyInssIncomeReport = (text) => {
  const warnings = [];
  let creditRowsPreview = [];

  try {
    creditRowsPreview = parseInssCreditHistoryPdfText(text)
      .slice(0, 3)
      .map((row) => row.raw);
  } catch {
    warnings.push("inss_preview_unavailable");
  }

  return {
    extractorName: "income-report-inss",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportProfile: "credit_history",
      reportYear: extractCalendarYear(text),
      profileSuggestion: extractInssSuggestion(text),
      creditRowsPreview,
      previewLines: getPreviewLines(text),
    },
    warnings,
  };
};

const extractIncomeReportInss = (text) =>
  extractAnnualInssIncomeReport(text) || extractLegacyInssIncomeReport(text);

const extractItauStyleAnnualBankIncomeReport = (text, classification) => {
  const normalizedText = normalizeText(text);

  if (!normalizedText.includes("ficha da declaracao: bens e direitos")) {
    return null;
  }

  const lineEntries = getLineEntries(text);
  const customer = parseCustomerInfo(lineEntries);
  const institution = parseInstitutionLine(lineEntries, /fonte pagadora:/);
  const debtInstitution = parseInstitutionLine(lineEntries, /credor:/);
  const warnings = [];
  const exclusiveIncomeItems = [];
  const assetItems = [];
  const debtItems = [];
  const sectionTotals = {
    exclusiveIncomeGrossTotal: null,
    exclusiveIncomeDeclarableTotal: null,
    assetBalancePrevTotal: null,
    assetBalanceCurrTotal: null,
    debtBalancePrevTotal: null,
    debtBalanceCurrTotal: null,
  };
  let section = null;

  for (let index = 0; index < lineEntries.length; index += 1) {
    const entry = lineEntries[index];

    if (entry.normalized.includes("ficha da declaracao: rendimentos sujeitos")) {
      section = "exclusive_income";
      continue;
    }

    if (entry.normalized.includes("ficha da declaracao: bens e direitos")) {
      section = "assets";
      continue;
    }

    if (entry.normalized.includes("ficha da declaracao: dividas e onus reais")) {
      section = "debts";
      continue;
    }

    if (entry.normalized.startsWith("total:")) {
      if (section === "exclusive_income") {
        const match = entry.raw.match(/Total:\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);

        if (match) {
          sectionTotals.exclusiveIncomeGrossTotal = parseSignedAmount(match[1]);
          sectionTotals.exclusiveIncomeDeclarableTotal = parseSignedAmount(match[3]);
        }
      }

      if (section === "assets") {
        const match = entry.raw.match(/Total:\s*([\d.,]+)\s+([\d.,]+)/i);

        if (match) {
          sectionTotals.assetBalancePrevTotal = parseSignedAmount(match[1]);
          sectionTotals.assetBalanceCurrTotal = parseSignedAmount(match[2]);
        }
      }

      if (section === "debts") {
        const match = entry.raw.match(/Total:\s*([\d.,]+)\s+([\d.,]+)/i);

        if (match) {
          sectionTotals.debtBalancePrevTotal = parseSignedAmount(match[1]);
          sectionTotals.debtBalanceCurrTotal = parseSignedAmount(match[2]);
        }
      }

      continue;
    }

    if (section === "exclusive_income") {
      const match = entry.raw.match(
        /^(\d{4}\/[\d-]+)\s+(\d{2})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i,
      );

      if (match) {
        exclusiveIncomeItems.push({
          branchAccount: match[1],
          incomeTypeCode: match[2],
          product: match[3].trim(),
          grossIncome: parseSignedAmount(match[4]),
          withheldTax: parseSignedAmount(match[5]),
          declarableAmount: parseSignedAmount(match[6]),
          institutionName: institution.name || classification.sourceLabelSuggestion || null,
          institutionDocument: institution.document,
        });
      }

      continue;
    }

    if (section === "assets") {
      const match = entry.raw.match(
        /^(\d{4}\/[\d-]+)\s+(\d{2})\s+(\d{2})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)$/i,
      );

      if (match) {
        assetItems.push({
          branchAccount: match[1],
          groupCode: match[2],
          itemCode: match[3],
          product: match[4].trim(),
          balancePrevYear: parseSignedAmount(match[5]),
          balanceCurrYear: parseSignedAmount(match[6]),
          institutionName: institution.name || classification.sourceLabelSuggestion || null,
          institutionDocument: institution.document,
        });
      }

      continue;
    }

    if (section === "debts") {
      const combinedLine = `${entry.raw} ${lineEntries[index + 1]?.raw || ""}`.trim();
      const match = combinedLine.match(
        /^(\d{4}\/[\d-]+)\s+(\d{2})\s+(.+?)\s+(\d{9,})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)$/i,
      );

      if (match) {
        debtItems.push({
          branchAccount: match[1],
          productCode: match[2],
          product: match[3].trim(),
          contractNumber: match[4],
          contractingDate: match[5],
          balancePrevYear: parseSignedAmount(match[6]),
          balanceCurrYear: parseSignedAmount(match[7]),
          institutionName:
            debtInstitution.name || institution.name || classification.sourceLabelSuggestion || null,
          institutionDocument: debtInstitution.document || institution.document,
        });
        index += 1;
      }
    }
  }

  if (exclusiveIncomeItems.length === 0 && assetItems.length === 0 && debtItems.length === 0) {
    return null;
  }

  if (
    !hasMatchingSectionTotal(
      exclusiveIncomeItems,
      sectionTotals.exclusiveIncomeDeclarableTotal,
      (item) => item.declarableAmount,
    )
  ) {
    warnings.push("annual_bank_exclusive_income_total_mismatch");
  }

  if (
    !hasMatchingSectionTotal(
      assetItems,
      sectionTotals.assetBalanceCurrTotal,
      (item) => item.balanceCurrYear,
    )
  ) {
    warnings.push("annual_bank_asset_total_mismatch");
  }

  if (
    !hasMatchingSectionTotal(
      debtItems,
      sectionTotals.debtBalanceCurrTotal,
      (item) => item.balanceCurrYear,
    )
  ) {
    warnings.push("annual_bank_debt_total_mismatch");
  }

  return {
    extractorName: "income-report-bank",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportProfile: "annual",
      reportYear: extractCalendarYear(text),
      institutionName: institution.name || classification.sourceLabelSuggestion || null,
      institutionDocument: institution.document,
      customerName: customer.name,
      customerDocument: customer.cpf,
      exclusiveIncomeItems,
      assetItems,
      debtItems,
      sectionTotals,
      detectedSections: buildSectionFlags(normalizedText, [
        "rendimentos sujeitos",
        "tributacao exclusiva",
        "bens e direitos",
        "dividas e onus reais",
      ]),
      previewLines: getPreviewLines(text),
    },
    warnings,
  };
};

const isBlockMetadataLine = (normalizedLine) =>
  [
    "nome",
    "cnpj",
    "cpf:",
    "cpf",
    "nome completo:",
    "nome completo",
    "pessoa fisica beneficiaria",
    "ano calendario",
    "bens e direitos",
    "informacoes para declaracao",
    "rendimentos sujeitos a tributacao exclusiva",
    "valor",
  ].includes(normalizedLine) || /^\d{4}$/.test(normalizedLine);

const findBlockInstitutionData = (lineEntries, blockStartIndex) => {
  let institutionDocument = null;
  let institutionName = null;

  for (let index = blockStartIndex - 1; index >= Math.max(0, blockStartIndex - 8); index -= 1) {
    const documentMatch = lineEntries[index].raw.match(
      /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/,
    );

    if (!documentMatch) {
      continue;
    }

    institutionDocument = documentMatch[1];

    for (let cursor = index - 1; cursor >= Math.max(0, index - 4); cursor -= 1) {
      const candidate = lineEntries[cursor];

      if (
        !candidate ||
        isBlockMetadataLine(candidate.normalized) ||
        /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/.test(candidate.raw)
      ) {
        continue;
      }

      institutionName = candidate.raw;
      break;
    }

    break;
  }

  return {
    institutionName,
    institutionDocument,
  };
};

const extractPicPayStyleAnnualBankIncomeReport = (text, classification) => {
  const normalizedText = normalizeText(text);

  if (
    !/fonte pagadora \d+\/\d+:/i.test(normalizedText) ||
    !normalizedText.includes("bens e direitos")
  ) {
    return null;
  }

  const lineEntries = getLineEntries(text);
  const customer = parseCustomerInfo(lineEntries);
  const blockStartIndexes = lineEntries.reduce((indexes, entry, index) => {
    if (entry.normalized.startsWith("fonte pagadora ")) {
      indexes.push(index);
    }

    return indexes;
  }, []);
  const exclusiveIncomeItems = [];
  const assetItems = [];

  for (let blockIndex = 0; blockIndex < blockStartIndexes.length; blockIndex += 1) {
    const blockStartIndex = blockStartIndexes[blockIndex];
    const blockEndIndex =
      blockIndex + 1 < blockStartIndexes.length ? blockStartIndexes[blockIndex + 1] : lineEntries.length;
    const blockLines = lineEntries.slice(blockStartIndex, blockEndIndex);
    const { institutionName, institutionDocument } = findBlockInstitutionData(
      lineEntries,
      blockStartIndex,
    );
    const assetCodeMatch = blockLines
      .map((entry) => entry.raw.match(/C[oó]digo:\s*(\d{2})\s*-\s*(.+)$/i))
      .find(Boolean);
    const groupCodeMatch = blockLines
      .map((entry) => entry.raw.match(/Grupo de bens:\s*(\d{2})\s*-\s*(.+)$/i))
      .find(Boolean);
    const balancesIndex = blockLines.findIndex((entry) =>
      entry.normalized.includes("saldo em 31/12/2024 saldo em 31/12/2025"),
    );
    const balancesLine = balancesIndex >= 0 ? blockLines[balancesIndex + 1] : null;
    const balanceMatch = balancesLine?.raw.match(
      /R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)(?:\s+(.+))?/i,
    );
    const incomeCodeMatch = blockLines
      .slice(assetCodeMatch ? blockLines.indexOf(blockLines.find((entry) => entry.raw.includes(assetCodeMatch[0]))) + 1 : 0)
      .map((entry) => entry.raw.match(/C[oó]digo:\s*(\d{2})\s*-\s*(.+)$/i))
      .find(Boolean);
    const incomeValueIndex = blockLines.findIndex((entry) => entry.normalized === "valor");
    const incomeValueLine = incomeValueIndex >= 0 ? blockLines[incomeValueIndex + 1] : null;
    const incomeValueMatch = incomeValueLine?.raw.match(/R\$\s*([\d.,]+)(?:\s+(.+))?/i);
    const trailingAssetDescription =
      balanceMatch?.[3]?.trim() ||
      (balancesIndex >= 0 &&
      blockLines[balancesIndex + 2] &&
      !blockLines[balancesIndex + 2].normalized.includes("rendimentos sujeitos")
        ? blockLines[balancesIndex + 2].raw
        : null);

    if (assetCodeMatch && groupCodeMatch && balanceMatch) {
      assetItems.push({
        branchAccount: null,
        groupCode: groupCodeMatch[1],
        itemCode: assetCodeMatch[1],
        product: trailingAssetDescription || assetCodeMatch[2].trim(),
        balancePrevYear: parseSignedAmount(balanceMatch[1]),
        balanceCurrYear: parseSignedAmount(balanceMatch[2]),
        institutionName: institutionName || classification.sourceLabelSuggestion || null,
        institutionDocument,
      });
    }

    if (incomeCodeMatch && incomeValueMatch) {
      exclusiveIncomeItems.push({
        branchAccount: null,
        incomeTypeCode: incomeCodeMatch[1],
        product: incomeValueMatch[2]?.trim() || incomeCodeMatch[2].trim(),
        grossIncome: parseSignedAmount(incomeValueMatch[1]),
        withheldTax: 0,
        declarableAmount: parseSignedAmount(incomeValueMatch[1]),
        institutionName: institutionName || classification.sourceLabelSuggestion || null,
        institutionDocument,
      });
    }
  }

  if (exclusiveIncomeItems.length === 0 && assetItems.length === 0) {
    return null;
  }

  return {
    extractorName: "income-report-bank",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportProfile: "annual",
      reportYear: extractCalendarYear(text),
      institutionName: classification.sourceLabelSuggestion || null,
      institutionDocument: null,
      customerName: customer.name,
      customerDocument: customer.cpf,
      exclusiveIncomeItems,
      assetItems,
      debtItems: [],
      sectionTotals: {
        exclusiveIncomeGrossTotal: sumAmounts(exclusiveIncomeItems, (item) => item.grossIncome),
        exclusiveIncomeDeclarableTotal: sumAmounts(
          exclusiveIncomeItems,
          (item) => item.declarableAmount,
        ),
        assetBalancePrevTotal: sumAmounts(assetItems, (item) => item.balancePrevYear),
        assetBalanceCurrTotal: sumAmounts(assetItems, (item) => item.balanceCurrYear),
        debtBalancePrevTotal: 0,
        debtBalanceCurrTotal: 0,
      },
      detectedSections: buildSectionFlags(normalizedText, [
        "bens e direitos",
        "rendimentos sujeitos a tributacao exclusiva",
      ]),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractGenericBankIncomeReport = (text, classification) => {
  const normalizedText = normalizeText(text);

  return {
    extractorName: "income-report-bank",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportProfile: "generic",
      reportYear: extractCalendarYear(text),
      institutionName: classification.sourceLabelSuggestion,
      institutionDocument: extractFirstMatch(text, /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/),
      exclusiveTaxIncomeTotal: extractAmountByPatterns(normalizedText, [
        /(?:rendimentos sujeitos a\s+)?tributacao exclusiva(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      exemptIncomeTotal: extractAmountByPatterns(normalizedText, [
        /rendimentos isentos(?:\s+e\s+nao\s+tributaveis)?(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      withheldTaxTotal: extractAmountByPatterns(normalizedText, [
        /imposto(?:\s+sobre\s+a\s+renda)?\s+retido\s+na\s+fonte(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      detectedSections: buildSectionFlags(normalizedText, [
        "rendimentos sujeitos",
        "tributacao exclusiva",
        "rendimentos isentos",
        "31/12/",
      ]),
      yearEndBalances: extractGenericYearEndBalances(text),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractBankIncomeReport = (text, classification) =>
  extractItauStyleAnnualBankIncomeReport(text, classification) ||
  extractPicPayStyleAnnualBankIncomeReport(text, classification) ||
  extractGenericBankIncomeReport(text, classification);

const extractEmployerIncomeReport = (text) => {
  const normalizedText = normalizeText(text);

  return {
    extractorName: "income-report-employer",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractCalendarYear(text),
      payerName:
        extractFirstMatch(text, /fonte pagadora[:\s]+([^\n\r]{3,120})/i) ||
        extractFirstMatch(text, /nome empresarial[:\s]+([^\n\r]{3,120})/i),
      payerDocument: extractFirstMatch(text, /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/),
      beneficiaryName: extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      beneficiaryDocument: extractFirstMatch(text, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/),
      taxableIncome: extractAmountByPatterns(normalizedText, [
        /rendimentos tributaveis(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
        /total de rendimentos tributaveis(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      withheldTax: extractAmountByPatterns(normalizedText, [
        /imposto(?:\s+sobre\s+a\s+renda)?\s+retido\s+na\s+fonte(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
        /\birrf(?:\s+total)?(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      officialSocialSecurity: extractAmountByPatterns(normalizedText, [
        /contribuicao previdenciaria oficial(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      thirteenthSalary: extractAmountByPatterns(normalizedText, [
        /(?:decimo terceiro|13o salario)(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      detectedSections: buildSectionFlags(normalizedText, [
        "rendimentos tributaveis",
        "imposto sobre a renda retido na fonte",
        "contribuicao previdenciaria oficial",
        "decimo terceiro",
      ]),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractMedicalStatement = (text, classification) => {
  const normalizedText = normalizeText(text);
  const totalAmount = extractFirstMatch(
    text,
    /(?:valor pago|total pago|total de despesas|despesa total)[:\s]*r?\$?\s*([\d.,]+)/i,
  );

  return {
    extractorName: "medical-statement",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractCalendarYear(text),
      providerName: classification.sourceLabelSuggestion,
      beneficiaryName: extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      totalAmount: totalAmount ? parseSignedAmount(totalAmount) : null,
      hasReimbursement: normalizedText.includes("reembolso"),
      hasCoparticipation: normalizedText.includes("coparticipacao"),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractEducationReceipt = (text) => {
  const totalAmount = extractFirstMatch(
    text,
    /(?:valor pago|total pago|mensalidade|valor total)[:\s]*r?\$?\s*([\d.,]+)/i,
  );

  return {
    extractorName: "education-receipt",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractCalendarYear(text),
      institutionName:
        extractFirstMatch(text, /institui[cç][aã]o de ensino[:\s]+([^\n\r]{3,120})/i) ||
        getPreviewLines(text, 1)[0] ||
        null,
      studentName:
        extractFirstMatch(text, /alun[oa][:\s]+([^\n\r]{3,120})/i) ||
        extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      documentNumber: extractFirstMatch(text, /(?:recibo|documento|nf)[\s#:nºo]*([a-z0-9\-/.]+)/i),
      totalAmount: totalAmount ? parseSignedAmount(totalAmount) : null,
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const EXTRACTORS_BY_TYPE = Object.freeze({
  income_report_bank: extractBankIncomeReport,
  income_report_employer: extractEmployerIncomeReport,
  income_report_inss: extractIncomeReportInss,
  medical_statement: extractMedicalStatement,
  education_receipt: extractEducationReceipt,
});

export const hasTaxExtractorForDocumentType = (documentType) =>
  typeof EXTRACTORS_BY_TYPE[documentType] === "function";

export const runTaxExtractorForDocument = ({
  documentType,
  text = "",
  classification = {},
}) => {
  const extractor = EXTRACTORS_BY_TYPE[documentType];

  if (!extractor) {
    return null;
  }

  return extractor(text, classification);
};
