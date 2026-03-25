import { parse as parseCsv } from "csv-parse/sync";
import {
  extractTextFromPdfWithOcr,
  isImportOcrEnabled,
  shouldRunPdfOcrFallback,
} from "./pdf-ocr.js";

const STATEMENT_ROW_MAX = 2000;
const BALANCE_TERMS = [
  "saldo do dia",
  "saldo em conta",
  "saldo total",
  "saldo anterior",
  "saldo final",
  "saldo",
];
const MONTH_NAME_REGEX =
  /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s+(\d{4})\b/i;

const HEADER_ALIASES = {
  date: [
    "date",
    "data",
    "datalancamento",
    "datalanc",
    "datamovimento",
    "datamovimentacao",
    "transactiondate",
  ],
  description: [
    "description",
    "descricao",
    "descricaolancamento",
    "historico",
    "lancamento",
    "detalhe",
    "memo",
    "estabelecimento",
  ],
  amount: ["value", "valor", "amount", "valorr", "valorr$", "quantia"],
  type: ["type", "tipo", "natureza"],
  debit: ["debit", "debito", "debtor", "saidas", "saida", "valorsaida"],
  credit: ["credit", "credito", "entrada", "entradas", "valorentrada"],
  notes: ["notes", "nota", "notas", "observacao", "observacoes", "obs"],
};
const PDF_WITHOUT_TEXT_GUIDANCE_MESSAGE = "PDF sem texto reconhecivel. Tente OFX ou CSV.";

const collapseWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const normalizeHeaderAlias = (value) =>
  collapseWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeAmountToken = (value) => collapseWhitespace(value).replace(/^R\$\s*/i, "");

const formatValue = (value) => Number(value).toFixed(2);

const detectCsvDelimiter = (content) => {
  const firstLine = String(content || "").split(/\r?\n/, 1)[0] || "";

  if (firstLine.includes(";")) {
    return ";";
  }

  if (firstLine.includes("\t")) {
    return "\t";
  }

  return ",";
};

const isBalanceDescription = (value) => {
  const normalizedValue = collapseWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return BALANCE_TERMS.some((term) => normalizedValue.includes(term));
};

const parseSignedAmount = (value) => {
  const normalizedValue = normalizeAmountToken(value).replace(/\s+/g, "");

  if (!normalizedValue) {
    return null;
  }

  let signal = 1;
  let numericValue = normalizedValue;

  if (/d$/i.test(numericValue)) {
    signal = -1;
    numericValue = numericValue.slice(0, -1);
  } else if (/c$/i.test(numericValue)) {
    signal = 1;
    numericValue = numericValue.slice(0, -1);
  } else if (numericValue.endsWith("-")) {
    signal = -1;
    numericValue = numericValue.slice(0, -1);
  }

  if (numericValue.startsWith("-")) {
    signal = -1;
    numericValue = numericValue.slice(1);
  } else if (numericValue.startsWith("+")) {
    numericValue = numericValue.slice(1);
  }

  const hasComma = numericValue.includes(",");
  const hasDot = numericValue.includes(".");
  let normalizedNumericValue = numericValue;

  if (hasComma && hasDot) {
    const decimalSeparator =
      numericValue.lastIndexOf(",") > numericValue.lastIndexOf(".") ? "," : ".";

    normalizedNumericValue =
      decimalSeparator === ","
        ? numericValue.replace(/\./g, "").replace(",", ".")
        : numericValue.replace(/,/g, "");
  } else if (hasComma) {
    normalizedNumericValue = numericValue.replace(/\./g, "").replace(",", ".");
  }

  const parsedValue = Number(normalizedNumericValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Number((parsedValue * signal).toFixed(2));
};

const detectStatementYear = (text) => {
  const monthHeaderMatch = String(text || "").match(MONTH_NAME_REGEX);

  if (monthHeaderMatch) {
    return monthHeaderMatch[2];
  }

  const fullDateMatch = String(text || "").match(/\b\d{2}\/\d{2}\/(\d{4})\b/);
  return fullDateMatch ? fullDateMatch[1] : "";
};

const toIsoDateString = (value, fallbackYear = "") => {
  const normalizedValue = collapseWhitespace(value);

  if (!normalizedValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const brDateMatch = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDateMatch) {
    const [, dayPart, monthPart, yearPart] = brDateMatch;
    return `${yearPart}-${monthPart}-${dayPart}`;
  }

  const shortDateMatch = normalizedValue.match(/^(\d{2})\/(\d{2})$/);
  if (shortDateMatch && fallbackYear) {
    const [, dayPart, monthPart] = shortDateMatch;
    return `${fallbackYear}-${monthPart}-${dayPart}`;
  }

  return normalizedValue;
};

const toNormalizedType = (value) => {
  const normalizedValue = collapseWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalizedValue) {
    return "";
  }

  if (["entrada", "credito", "credit", "c"].includes(normalizedValue)) {
    return "Entrada";
  }

  if (["saida", "debito", "debit", "d"].includes(normalizedValue)) {
    return "Saida";
  }

  return String(value || "");
};

const findMappedHeader = (headers, aliases) => {
  const aliasesSet = new Set(aliases);
  return headers.find((header) => aliasesSet.has(normalizeHeaderAlias(header))) || null;
};

const buildRawRow = ({
  date,
  type,
  value,
  description,
  notes = "",
  category = "",
}) => ({
  date: String(date || ""),
  type: String(type || ""),
  value: String(value || ""),
  description: String(description || ""),
  notes: String(notes || ""),
  category: String(category || ""),
});

const finalizeStatementRows = (rows) => {
  if (rows.length > STATEMENT_ROW_MAX) {
    throw new Error(`Arquivo excede o limite de ${STATEMENT_ROW_MAX} linhas.`);
  }

  if (rows.length === 0) {
    throw new Error("Nenhuma transacao reconhecida no arquivo.");
  }

  return rows;
};

export const getPdfImportGuidanceError = (text, ocrEnabled = isImportOcrEnabled()) => {
  if (ocrEnabled) {
    return "";
  }

  if (shouldRunPdfOcrFallback(text)) {
    return PDF_WITHOUT_TEXT_GUIDANCE_MESSAGE;
  }

  return "";
};

export const parseStatementCsvRows = (buffer) => {
  const csvContent = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  let records;

  try {
    records = parseCsv(csvContent, {
      bom: true,
      columns: true,
      delimiter: detectCsvDelimiter(csvContent),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });
  } catch {
    throw new Error("Nao foi possivel ler o CSV do extrato.");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("CSV vazio.");
  }

  const headers = Object.keys(records[0] || {});
  const mappedHeaders = {
    date: findMappedHeader(headers, HEADER_ALIASES.date),
    description: findMappedHeader(headers, HEADER_ALIASES.description),
    amount: findMappedHeader(headers, HEADER_ALIASES.amount),
    type: findMappedHeader(headers, HEADER_ALIASES.type),
    debit: findMappedHeader(headers, HEADER_ALIASES.debit),
    credit: findMappedHeader(headers, HEADER_ALIASES.credit),
    notes: findMappedHeader(headers, HEADER_ALIASES.notes),
  };

  if (
    !mappedHeaders.date ||
    !mappedHeaders.description ||
    (!mappedHeaders.amount && !mappedHeaders.debit && !mappedHeaders.credit)
  ) {
    throw new Error("Nao foi possivel reconhecer as colunas do extrato.");
  }

  const rows = records.reduce((accumulator, record, recordIndex) => {
    const description = collapseWhitespace(record[mappedHeaders.description]);

    if (!description || isBalanceDescription(description)) {
      return accumulator;
    }

    const dateValue = toIsoDateString(record[mappedHeaders.date]);
    const notes = mappedHeaders.notes ? collapseWhitespace(record[mappedHeaders.notes]) : "";
    const explicitType = mappedHeaders.type
      ? toNormalizedType(record[mappedHeaders.type])
      : "";

    let resolvedType = explicitType;
    let resolvedValue = mappedHeaders.amount ? collapseWhitespace(record[mappedHeaders.amount]) : "";

    if (mappedHeaders.amount) {
      const parsedAmount = parseSignedAmount(record[mappedHeaders.amount]);

      if (parsedAmount !== null) {
        resolvedType = resolvedType || (parsedAmount < 0 ? "Saida" : "Entrada");
        resolvedValue = formatValue(Math.abs(parsedAmount));
      }
    } else {
      const parsedCredit = mappedHeaders.credit
        ? parseSignedAmount(record[mappedHeaders.credit])
        : null;
      const parsedDebit = mappedHeaders.debit
        ? parseSignedAmount(record[mappedHeaders.debit])
        : null;

      if (parsedCredit !== null && parsedCredit !== 0) {
        resolvedType = "Entrada";
        resolvedValue = formatValue(Math.abs(parsedCredit));
      } else if (parsedDebit !== null && parsedDebit !== 0) {
        resolvedType = "Saida";
        resolvedValue = formatValue(Math.abs(parsedDebit));
      } else {
        resolvedValue = collapseWhitespace(
          record[mappedHeaders.credit] || record[mappedHeaders.debit] || "",
        );
      }
    }

    accumulator.push({
      line: recordIndex + 2,
      raw: buildRawRow({
        date: dateValue,
        type: resolvedType,
        value: resolvedValue,
        description,
        notes,
      }),
    });

    return accumulator;
  }, []);

  return finalizeStatementRows(rows);
};

export const parseGenericBankStatementPdfText = (text) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);

  const rows = [];
  const statementYear = detectStatementYear(text);
  let currentDate = "";

  lines.forEach((line, index) => {
    const datedMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(-?\d[\d.]*,\d{2}-?)$/);
    const continuedMatch = !datedMatch ? line.match(/^(.+?)\s+(-?\d[\d.]*,\d{2}-?)$/) : null;
    let datePart = "";
    let descriptionPart = "";
    let amountPart = "";

    if (datedMatch) {
      [, datePart, descriptionPart, amountPart] = datedMatch;
      currentDate = datePart;
    } else if (continuedMatch && currentDate) {
      [, descriptionPart, amountPart] = continuedMatch;
      datePart = currentDate;
    } else {
      return;
    }

    const description = collapseWhitespace(descriptionPart);

    if (!description || isBalanceDescription(description)) {
      return;
    }

    const parsedAmount = parseSignedAmount(amountPart);
    if (parsedAmount === null) {
      return;
    }

    rows.push({
      line: index + 1,
      raw: buildRawRow({
        date: toIsoDateString(datePart, statementYear),
        type: parsedAmount < 0 ? "Saida" : "Entrada",
        value: formatValue(Math.abs(parsedAmount)),
        description,
      }),
    });
  });

  return finalizeStatementRows(rows);
};

const parseRubricaTotal = (blockText, rubricaPattern) => {
  const matches = blockText.matchAll(rubricaPattern);
  let total = 0;

  for (const match of matches) {
    const parsedValue = parseSignedAmount(match[1]);
    if (parsedValue !== null) {
      total += Math.abs(parsedValue);
    }
  }

  return Number(total.toFixed(2));
};

export const parseInssCreditHistoryPdfText = (text) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);
  const rows = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const headerMatch = lines[lineIndex].match(/^(\d{2}\/\d{4})\s+R\$\s*([\d.,]+)/);

    if (!headerMatch) {
      continue;
    }

    const competence = headerMatch[1];
    const liquidAmount = parseSignedAmount(headerMatch[2]);
    const startLine = lineIndex + 1;
    const blockLines = [lines[lineIndex]];
    let nextIndex = lineIndex + 1;

    while (nextIndex < lines.length && !/^\d{2}\/\d{4}\s+R\$\s*[\d.,]+/.test(lines[nextIndex])) {
      blockLines.push(lines[nextIndex]);
      nextIndex += 1;
    }

    lineIndex = nextIndex - 1;

    if (liquidAmount === null) {
      continue;
    }

    const blockText = blockLines.join(" ");
    const paymentDates = blockLines
      .slice(0, 4)
      .join(" ")
      .match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const paymentDate = paymentDates[paymentDates.length - 1] || "";
    const grossMatch = blockText.match(/101 VALOR TOTAL DE MR DO PERIODO R\$\s*([\d.,]+)/i);
    const grossAmount = grossMatch ? parseSignedAmount(grossMatch[1]) : null;
    const loansTotal = parseRubricaTotal(
      blockText,
      /(?:216|217)\s+.*?R\$\s*([\d.,]+)/gi,
    );
    const cardTotal = parseRubricaTotal(blockText, /268\s+.*?R\$\s*([\d.,]+)/gi);
    const notesParts = [];

    if (grossAmount !== null) {
      notesParts.push(`MR ${formatValue(Math.abs(grossAmount))}`);
    }
    if (loansTotal > 0) {
      notesParts.push(`Emprestimos ${formatValue(loansTotal)}`);
    }
    if (cardTotal > 0) {
      notesParts.push(`Cartao ${formatValue(cardTotal)}`);
    }

    rows.push({
      line: startLine,
      raw: buildRawRow({
        date: paymentDate ? toIsoDateString(paymentDate) : competence,
        type: "Entrada",
        value: formatValue(Math.abs(liquidAmount)),
        description: `Credito INSS ${competence}`,
        notes: notesParts.join(" | "),
      }),
    });
  }

  return finalizeStatementRows(rows);
};

const MONTH_NAMES_MAP = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const resolveReferenceMonth = (raw) => {
  if (!raw) return null;
  const numericMatch = raw.match(/(\d{2})\/?(\d{4})/);
  if (numericMatch) return `${numericMatch[1]}/${numericMatch[2]}`;
  const normalized = collapseWhitespace(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const namedMatch = normalized.match(/([a-z]+)[\s/]+(\d{4})/);
  if (namedMatch) {
    const mm = MONTH_NAMES_MAP[namedMatch[1]];
    if (mm) return `${mm}/${namedMatch[2]}`;
  }
  return null;
};

const normalizeForExtraction = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const extractInssSuggestion = (text) => {
  const normalized = normalizeForExtraction(text);

  // Benefit ID (NB)
  const nbMatch = normalized.match(/\bnb[:\s#°]*([\d.\-/]+)/i);
  const benefitId = nbMatch ? nbMatch[1].trim() : null;

  // Benefit kind (Espécie)
  const especieMatch = normalized.match(/especie[:\s]+(\d+)\s*[-–]\s*([^\n\r]{3,60})/i);
  const benefitKind = especieMatch ? collapseWhitespace(especieMatch[2]) : null;

  // Most recent credit entry (first match — PDF lists newest first)
  const entryMatch = normalized.match(/^(\d{2}\/\d{4})\s+r\$\s*([\d.,]+)/m);
  if (!entryMatch) return null;

  const referenceMonth = entryMatch[1];
  const netAmount = parseSignedAmount(entryMatch[2]);
  if (netAmount === null) return null;

  // Find the block for this entry to get payment date and gross amount
  const entryStart = normalized.indexOf(entryMatch[0]);
  const nextEntryMatch = normalized.slice(entryStart + 1).match(/\d{2}\/\d{4}\s+r\$\s*[\d.,]+/);
  const blockEnd = nextEntryMatch
    ? entryStart + 1 + normalized.slice(entryStart + 1).indexOf(nextEntryMatch[0])
    : entryStart + 2000;
  const block = normalized.slice(entryStart, blockEnd);

  const fullDates = block.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const paymentDateRaw = fullDates[fullDates.length - 1] || null;
  const paymentDate = paymentDateRaw ? toIsoDateString(paymentDateRaw) : null;

  const grossMatch = block.match(/101\s+valor total de mr do periodo\s+r\$\s*([\d.,]+)/i);
  const grossAmount = grossMatch ? parseSignedAmount(grossMatch[1]) : null;

  return {
    type: "profile",
    benefitId,
    benefitKind,
    referenceMonth,
    paymentDate,
    netAmount: Math.abs(netAmount),
    grossAmount: grossAmount !== null ? Math.abs(grossAmount) : null,
  };
};

const ENERGY_ISSUERS = [
  "neoenergia", "neoenergia elektro", "cpfl energia", "enel", "cemig", "light", "eletropaulo",
  "energisa", "elektro", "coelba", "celpe", "cosern", "ceal", "ceron", "boa energia",
];
const WATER_ISSUERS = [
  "saae", "sabesp", "sanepar", "copasa", "cagece", "caern", "casan", "embasa",
  "compesa", "agespisa", "caema", "cosanpa",
];

const detectIssuerFromText = (normalizedText, candidates) => {
  for (const candidate of candidates) {
    if (normalizedText.includes(candidate)) return candidate;
  }
  return null;
};

const extractBillFields = (normalizedText) => {
  // Reference month
  const refMatch = normalizedText.match(
    /(?:referencia|referencia do mes|competencia|periodo de referencia|mes de referencia)[:\s]+([a-z]+[\s/]+\d{4}|\d{1,2}[/]\d{4})/i,
  );
  const referenceMonth = resolveReferenceMonth(refMatch ? refMatch[1] : null);

  // Due date
  const dueMatch = normalizedText.match(/vencimento[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  const dueDate = dueMatch ? toIsoDateString(dueMatch[1]) : null;

  // Amount due
  const amountMatch = normalizedText.match(
    /(?:total a pagar|valor a pagar|total do documento|valor total)[:\s]*r?\$?\s*([\d.,]+)/i,
  );
  const amountDue = amountMatch ? parseSignedAmount(amountMatch[1]) : null;

  return { referenceMonth, dueDate, amountDue: amountDue !== null ? Math.abs(amountDue) : null };
};

export const extractEnergyBillSuggestion = (text) => {
  const normalized = normalizeForExtraction(text);

  const issuerKey = detectIssuerFromText(normalized, ENERGY_ISSUERS);
  const { referenceMonth, dueDate, amountDue } = extractBillFields(normalized);

  // Customer code: "Código de Instalação", "N° Instalação", "Código do cliente"
  const codeMatch = normalized.match(
    /(?:codigo de instalacao|n[°o] instalacao|instalacao|codigo do cliente|numero do cliente|numero da instalacao)[:\s#°]*([\d.\-/]+)/i,
  );
  const customerCode = codeMatch ? codeMatch[1].trim() : null;

  if (!referenceMonth && !dueDate && amountDue === null) return null;

  return {
    type: "bill",
    billType: "energy",
    issuer: issuerKey,
    referenceMonth,
    dueDate,
    amountDue,
    customerCode,
  };
};

export const extractWaterBillSuggestion = (text) => {
  const normalized = normalizeForExtraction(text);

  const issuerKey = detectIssuerFromText(normalized, WATER_ISSUERS);
  const { referenceMonth, dueDate, amountDue } = extractBillFields(normalized);

  // Customer code: "Matrícula", "Código do cliente", "N° contrato"
  const codeMatch = normalized.match(
    /(?:matricula|matricula do imovel|codigo do cliente|n[°o] contrato|numero do cliente)[:\s#°]*([\d.\-/]+)/i,
  );
  const customerCode = codeMatch ? codeMatch[1].trim() : null;

  if (!referenceMonth && !dueDate && amountDue === null) return null;

  return {
    type: "bill",
    billType: "water",
    issuer: issuerKey,
    referenceMonth,
    dueDate,
    amountDue,
    customerCode,
  };
};

export const extractTextFromPdfBuffer = async (buffer) => extractTextFromPdfWithOcr(buffer);

export const parseStatementPdfRows = async (buffer) => {
  const text = await extractTextFromPdfBuffer(buffer);
  const pdfImportGuidanceError = getPdfImportGuidanceError(text);

  if (pdfImportGuidanceError) {
    throw new Error(pdfImportGuidanceError);
  }

  const normalizedText = collapseWhitespace(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalizedText) {
    throw new Error("Nao foi possivel extrair texto do PDF.");
  }

  if (
    normalizedText.includes("historico de creditos") &&
    normalizedText.includes("inss - instituto nacional do seguro social")
  ) {
    return parseInssCreditHistoryPdfText(text);
  }

  return parseGenericBankStatementPdfText(text);
};
