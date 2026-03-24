const TYPE_INCOME = "Entrada";
const TYPE_EXPENSE = "Saida";
const MAX_ROWS = 2000;

const collapseWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const formatValue = (value) => Number(value).toFixed(2);

const parseSignedAmount = (value) => {
  const normalizedValue = collapseWhitespace(value).replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeOfxDate = (value) => {
  const normalizedValue = String(value || "").trim();
  const compactValue = normalizedValue.replace(/[^0-9]/g, "");

  if (compactValue.length < 8) {
    return normalizedValue;
  }

  const year = compactValue.slice(0, 4);
  const month = compactValue.slice(4, 6);
  const day = compactValue.slice(6, 8);
  return `${year}-${month}-${day}`;
};

const resolveTypeFromAmount = (amount) => (amount < 0 ? TYPE_EXPENSE : TYPE_INCOME);

const resolveType = (trnType, amount) => {
  const normalizedType = collapseWhitespace(trnType).toUpperCase();

  if (["CREDIT", "DEP", "DIRECTDEP", "INT", "DIV", "CASH", "XFER"].includes(normalizedType)) {
    return TYPE_INCOME;
  }

  if (
    ["DEBIT", "PAYMENT", "CHECK", "ATM", "POS", "FEE", "SRVCHG", "XFER"].includes(normalizedType)
  ) {
    return amount < 0 ? TYPE_EXPENSE : TYPE_INCOME;
  }

  return resolveTypeFromAmount(amount);
};

const getOfxTagValue = (block, tagName) => {
  const closedTagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
  const closedTagMatch = block.match(closedTagRegex);

  if (closedTagMatch) {
    return collapseWhitespace(closedTagMatch[1]);
  }

  const openTagRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const openTagMatch = block.match(openTagRegex);
  return openTagMatch ? collapseWhitespace(openTagMatch[1]) : "";
};

export const parseOfxRows = (buffer) => {
  const content = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  const transactionBlocks = content.match(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi) || [];

  if (transactionBlocks.length === 0) {
    throw new Error("Nenhuma transacao reconhecida no OFX.");
  }

  if (transactionBlocks.length > MAX_ROWS) {
    throw new Error(`Arquivo excede o limite de ${MAX_ROWS} linhas.`);
  }

  return transactionBlocks.map((block, index) => {
    const amount = parseSignedAmount(getOfxTagValue(block, "TRNAMT"));
    if (amount === null) {
      throw new Error("Transacao OFX com valor invalido.");
    }

    const description =
      getOfxTagValue(block, "MEMO") ||
      getOfxTagValue(block, "NAME") ||
      getOfxTagValue(block, "FITID") ||
      `Transacao OFX ${index + 1}`;
    const fitId = getOfxTagValue(block, "FITID");

    return {
      line: index + 1,
      raw: {
        date: normalizeOfxDate(getOfxTagValue(block, "DTPOSTED")),
        type: resolveType(getOfxTagValue(block, "TRNTYPE"), amount),
        value: formatValue(Math.abs(amount)),
        description,
        notes: fitId ? `FITID ${fitId}` : "",
        category: "",
      },
    };
  });
};
