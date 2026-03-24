import { parse as parseCsv } from "csv-parse/sync";
import { extractTextFromPdfWithOcr } from "./pdf-ocr.js";

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

export const extractTextFromPdfBuffer = async (buffer) => extractTextFromPdfWithOcr(buffer);

export const parseStatementPdfRows = async (buffer) => {
  const text = await extractTextFromPdfBuffer(buffer);
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
