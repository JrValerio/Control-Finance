import { withDbTransaction, dbQuery } from "../db/index.js";
import { normalizeTaxUserId, normalizeTaxYear, createTaxError } from "../domain/tax/tax.validation.js";
import { rebuildTaxSummaryByYear } from "./tax-summary.service.js";

const normalizeMoney = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeDocumentNumber = (value) => String(value || "").replace(/\D/g, "");

const normalizeDateOnly = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const normalizedValue = String(value);
  const isoMatch = normalizedValue.match(/\d{4}-\d{2}-\d{2}/);

  if (isoMatch) {
    return isoMatch[0];
  }

  const parsedValue = new Date(normalizedValue);

  if (Number.isNaN(parsedValue.getTime())) {
    return normalizedValue.slice(0, 10);
  }

  return parsedValue.toISOString().slice(0, 10);
};

const compactObject = (value) =>
  Object.fromEntries(
    Object.entries(value || {}).filter(([, entryValue]) => entryValue !== undefined),
  );

const buildFactIdentityKey = (fact) =>
  [
    String(fact.dedupeKey || fact.dedupe_key || ""),
    String(fact.dedupeStrength || fact.dedupe_strength || ""),
    String(fact.factType || fact.fact_type || ""),
    String(fact.subcategory || ""),
    Number(fact.amount || 0).toFixed(2),
    String(fact.referencePeriod || fact.reference_period || ""),
    String(fact.conflictCode || fact.conflict_code || ""),
  ].join("|");

const resolveCalendarYearBounds = (taxYear) => {
  const calendarYear = Number(taxYear) - 1;

  return {
    calendarYear,
    monthFrom: `${calendarYear}-01`,
    monthToExclusive: `${calendarYear + 1}-01`,
    dateFrom: `${calendarYear}-01-01`,
    dateToExclusive: `${calendarYear + 1}-01-01`,
  };
};

const listExistingTaxDocumentsCountByYear = async (userId, taxYear) => {
  const result = await dbQuery(
    `SELECT COUNT(*) AS total
     FROM tax_documents
     WHERE user_id = $1
       AND tax_year = $2`,
    [userId, taxYear],
  );

  return Number(result.rows[0]?.total || 0);
};

const getUserTaxpayerDocument = async (userId) => {
  const result = await dbQuery(
    `SELECT taxpayer_cpf
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return normalizeDocumentNumber(result.rows[0]?.taxpayer_cpf || "");
};

const listPostedIncomeStatementsByYear = async (userId, taxYear) => {
  const { monthFrom, monthToExclusive } = resolveCalendarYearBounds(taxYear);
  const result = await dbQuery(
    `SELECT
       st.id,
       st.income_source_id,
       st.reference_month,
       st.net_amount,
       st.total_deductions,
       st.gross_amount,
       st.payment_date,
       st.posted_transaction_id,
       st.updated_at,
       s.name AS income_source_name
     FROM income_statements st
     INNER JOIN income_sources s
       ON s.id = st.income_source_id
     WHERE s.user_id = $1
       AND st.status = 'posted'
       AND st.reference_month >= $2
       AND st.reference_month < $3
     ORDER BY st.reference_month ASC, st.id ASC`,
    [userId, monthFrom, monthToExclusive],
  );

  return result.rows;
};

const listIncomeTransactionsByYear = async (userId, taxYear) => {
  const { dateFrom, dateToExclusive } = resolveCalendarYearBounds(taxYear);
  const [transactionsResult, postedTransactionsResult] = await Promise.all([
    dbQuery(
    `SELECT
       t.id,
       t.value,
       t.date,
       t.description,
       t.category_id,
       c.name AS category_name
     FROM transactions t
     INNER JOIN categories c
       ON c.id = t.category_id
      AND c.user_id = $1
      AND c.type = 'income'
     WHERE t.user_id = $1
       AND t.deleted_at IS NULL
       AND t.type = 'Entrada'
       AND t.date >= $2
       AND t.date < $3
     ORDER BY t.date ASC, t.id ASC`,
    [userId, dateFrom, dateToExclusive],
    ),
    dbQuery(
      `SELECT st.posted_transaction_id
       FROM income_statements st
       INNER JOIN income_sources s
         ON s.id = st.income_source_id
       WHERE s.user_id = $1
         AND st.status = 'posted'
         AND st.posted_transaction_id IS NOT NULL`,
      [userId],
    ),
  ]);

  const excludedTransactionIds = new Set(
    postedTransactionsResult.rows.map((row) => Number(row.posted_transaction_id)).filter(Number.isInteger),
  );

  return transactionsResult.rows.filter((row) => !excludedTransactionIds.has(Number(row.id)));
};

const buildStatementDerivedFact = ({ userId, taxYear, taxpayerDocument, row }) => {
  const grossAmount = normalizeMoney(row.gross_amount);
  const netAmount = normalizeMoney(row.net_amount);
  const amount = grossAmount > 0 ? grossAmount : netAmount;

  if (amount <= 0) {
    return null;
  }

  return {
    userId,
    taxYear,
    sourceDocumentId: null,
    factType: "taxable_income",
    category: "income",
    subcategory: "app_income_statement_taxable_income",
    payerName: String(row.income_source_name || ""),
    payerDocument: "",
    referencePeriod: String(row.reference_month || ""),
    currency: "BRL",
    amount,
    confidenceScore: grossAmount > 0 ? 0.85 : 0.7,
    dedupeKey: `app|income_statement|${Number(row.id)}|${taxYear}|taxable_income|${amount.toFixed(2)}`,
    dedupeStrength: "strong",
    metadataJson: compactObject({
      sourceOrigin: "app_income_statement",
      ownerDocument: taxpayerDocument || undefined,
      incomeSourceId: Number(row.income_source_id),
      incomeStatementId: Number(row.id),
      postedTransactionId:
        row.posted_transaction_id === null || typeof row.posted_transaction_id === "undefined"
          ? null
          : Number(row.posted_transaction_id),
      grossAmount: grossAmount || undefined,
      netAmount: netAmount || undefined,
      totalDeductions: normalizeMoney(row.total_deductions),
      paymentDate: normalizeDateOnly(row.payment_date) || null,
      amountBasis: grossAmount > 0 ? "gross_amount" : "net_amount",
    }),
    reviewStatus: "pending",
    conflictCode: null,
    conflictMessage: null,
  };
};

const buildTransactionDerivedFact = ({ userId, taxYear, taxpayerDocument, row }) => {
  const amount = normalizeMoney(row.value);

  if (amount <= 0) {
    return null;
  }

  return {
    userId,
    taxYear,
    sourceDocumentId: null,
    factType: "taxable_income",
    category: "income",
    subcategory: "app_transaction_income",
    payerName: String(row.description || row.category_name || "Entrada do app"),
    payerDocument: "",
    referencePeriod: normalizeDateOnly(row.date),
    currency: "BRL",
    amount,
    confidenceScore: 0.55,
    dedupeKey: `app|transaction|${Number(row.id)}|${taxYear}|taxable_income|${amount.toFixed(2)}`,
    dedupeStrength: "strong",
    metadataJson: compactObject({
      sourceOrigin: "app_transaction",
      ownerDocument: taxpayerDocument || undefined,
      transactionId: Number(row.id),
      transactionDate: normalizeDateOnly(row.date),
      categoryId:
        row.category_id === null || typeof row.category_id === "undefined"
          ? null
          : Number(row.category_id),
      categoryName: String(row.category_name || ""),
    }),
    reviewStatus: "pending",
    conflictCode: null,
    conflictMessage: null,
  };
};

const insertTaxFact = async (client, fact) => {
  await client.query(
    `INSERT INTO tax_facts (
       user_id,
       tax_year,
       source_document_id,
       fact_type,
       category,
       subcategory,
       payer_name,
       payer_document,
       reference_period,
       currency,
       amount,
       confidence_score,
       dedupe_key,
       dedupe_strength,
       metadata_json,
       review_status,
       conflict_code,
       conflict_message
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15::jsonb, $16, $17, $18
     )`,
    [
      fact.userId,
      fact.taxYear,
      fact.sourceDocumentId,
      fact.factType,
      fact.category,
      fact.subcategory,
      fact.payerName,
      fact.payerDocument,
      fact.referencePeriod,
      fact.currency,
      fact.amount,
      fact.confidenceScore,
      fact.dedupeKey,
      fact.dedupeStrength,
      JSON.stringify(fact.metadataJson || {}),
      fact.reviewStatus,
      fact.conflictCode,
      fact.conflictMessage,
    ],
  );
};

const applyPreviousReviewState = (fact, previousFactsByIdentity) => {
  const previousFact = previousFactsByIdentity.get(buildFactIdentityKey(fact));

  if (!previousFact) {
    return fact;
  }

  return {
    ...fact,
    reviewStatus: previousFact.review_status,
  };
};

const listExistingAppDerivedFactsByYear = async (client, userId, taxYear) => {
  const result = await client.query(
    `SELECT
       fact_type,
       subcategory,
       amount,
       reference_period,
       dedupe_key,
       dedupe_strength,
       review_status,
       conflict_code,
       metadata_json
     FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2
       AND source_document_id IS NULL`,
    [userId, taxYear],
  );

  const filteredRows = result.rows.filter((row) =>
    ["app_income_statement", "app_transaction"].includes(
      String(row.metadata_json?.sourceOrigin || ""),
    ),
  );
  const factsByIdentity = filteredRows.reduce((accumulator, row) => {
    accumulator.set(buildFactIdentityKey(row), row);
    return accumulator;
  }, new Map());
  const reviewedCount = filteredRows.filter(
    (row) => row.review_status === "approved" || row.review_status === "corrected",
  ).length;

  return {
    factsByIdentity,
    reviewedCount,
  };
};

const deleteExistingAppDerivedFactsByYear = async (client, userId, taxYear) => {
  const result = await client.query(
    `SELECT id, metadata_json
     FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2
       AND source_document_id IS NULL`,
    [userId, taxYear],
  );

  const factIds = result.rows
    .filter((row) =>
      ["app_income_statement", "app_transaction"].includes(
        String(row.metadata_json?.sourceOrigin || ""),
      ),
    )
    .map((row) => Number(row.id));

  if (factIds.length === 0) {
    return;
  }

  const placeholders = factIds.map((_, index) => `$${index + 3}`).join(", ");
  await client.query(
    `DELETE FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2
       AND id IN (${placeholders})`,
    [userId, taxYear, ...factIds],
  );
};

export const syncAppTaxFactsByYear = async (userId, taxYearValue, options = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const force = Boolean(options.force);
  const existingDocumentsCount = await listExistingTaxDocumentsCountByYear(normalizedUserId, taxYear);

  if (existingDocumentsCount > 0 && !force) {
    throw createTaxError(
      409,
      "Ja existem documentos fiscais neste exercicio. A importacao do app foi bloqueada para evitar mistura com a trilha documental.",
      "TAX_APP_SYNC_DOCUMENT_CONFLICT",
    );
  }

  const taxpayerDocument = await getUserTaxpayerDocument(normalizedUserId);
  const [statementRows, transactionRows] = await Promise.all([
    listPostedIncomeStatementsByYear(normalizedUserId, taxYear),
    listIncomeTransactionsByYear(normalizedUserId, taxYear),
  ]);
  const nextFacts = [
    ...statementRows
      .map((row) =>
        buildStatementDerivedFact({
          userId: normalizedUserId,
          taxYear,
          taxpayerDocument,
          row,
        }),
      )
      .filter(Boolean),
    ...transactionRows
      .map((row) =>
        buildTransactionDerivedFact({
          userId: normalizedUserId,
          taxYear,
          taxpayerDocument,
          row,
        }),
      )
      .filter(Boolean),
  ];

  let preservedReviewedFactsCount = 0;
  let hadReviewedFactsBefore = false;

  await withDbTransaction(async (client) => {
    const previousFactsSelection = await listExistingAppDerivedFactsByYear(
      client,
      normalizedUserId,
      taxYear,
    );
    const previousFactsByIdentity = previousFactsSelection.factsByIdentity;
    hadReviewedFactsBefore = previousFactsSelection.reviewedCount > 0;

    await deleteExistingAppDerivedFactsByYear(client, normalizedUserId, taxYear);

    for (const fact of nextFacts) {
      const factWithReviewState = applyPreviousReviewState(fact, previousFactsByIdentity);

      if (factWithReviewState.reviewStatus === "approved" || factWithReviewState.reviewStatus === "corrected") {
        preservedReviewedFactsCount += 1;
      }

      await insertTaxFact(client, factWithReviewState);
    }
  });

  let summaryRebuilt = false;

  if (nextFacts.length > 0 || preservedReviewedFactsCount > 0 || hadReviewedFactsBefore) {
    await rebuildTaxSummaryByYear(normalizedUserId, taxYear);
    summaryRebuilt = true;
  }

  return {
    taxYear,
    exerciseYear: taxYear,
    calendarYear: taxYear - 1,
    sourceOrigin: "app",
    processedStatements: statementRows.length,
    processedTransactions: transactionRows.length,
    totalFactsGenerated: nextFacts.length,
    preservedReviewedFactsCount,
    summariesRebuilt: summaryRebuilt ? 1 : 0,
  };
};
