import { dbQuery } from "../db/index.js";

const createError = (status, message, extra = {}) => {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Normalise text for provider matching: lowercase, strip accents, keep only
 * alphanumeric characters and spaces.
 */
const normaliseText = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

const scoreAmount = (billAmount, txAmount) => {
  const diff = Math.abs(billAmount - txAmount);
  const pct = diff / billAmount;
  if (pct <= 0.01) return { score: 0.5, divergencePercent: Number((pct * 100).toFixed(2)) };
  if (pct <= 0.05) return { score: 0.35, divergencePercent: Number((pct * 100).toFixed(2)) };
  if (pct <= 0.15) return { score: 0.15, divergencePercent: Number((pct * 100).toFixed(2)) };
  return { score: 0, divergencePercent: Number((pct * 100).toFixed(2)) };
};

const scoreDateDelta = (billDueDate, txDate) => {
  const due = new Date(billDueDate);
  const tx = new Date(txDate);
  const deltaDays = Math.abs(Math.round((tx - due) / 86_400_000));
  if (deltaDays === 0) return 0.3;
  if (deltaDays <= 3) return 0.22;
  if (deltaDays <= 7) return 0.12;
  return 0;
};

const scoreProvider = (billTitle, billProvider, txDescription) => {
  const haystack = normaliseText(txDescription);
  const needles = [normaliseText(billProvider), normaliseText(billTitle)].filter(Boolean);
  return needles.some((n) => n && haystack.includes(n)) ? 0.2 : 0;
};

/**
 * Score a bill against a transaction candidate.
 * Returns null when amountScore = 0 (divergence > 15% — never show as candidate).
 */
export const scoreBillTransactionMatch = (bill, tx) => {
  const { score: amountScore, divergencePercent } = scoreAmount(
    Number(bill.amount),
    Number(tx.value)
  );

  if (amountScore === 0) return null;

  const dateScore = scoreDateDelta(bill.due_date, tx.date);
  const providerScore = scoreProvider(bill.title, bill.provider, tx.description);
  const score = Number((amountScore + dateScore + providerScore).toFixed(4));

  return {
    score,
    amountScore,
    dateScore,
    providerScore,
    divergencePercent,
    requiresDivergenceConfirmation: divergencePercent > 5,
  };
};

const SCORE_DISPLAY_THRESHOLD = 0.5;

// ─── Read ─────────────────────────────────────────────────────────────────────

const fetchBillForUser = async (userId, billId) => {
  const parsed = Number(billId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de conta invalido.");
  }

  const { rows } = await dbQuery(
    `SELECT id, user_id, title, amount, due_date, provider, match_status, linked_transaction_id
       FROM bills
      WHERE id = $1 AND user_id = $2`,
    [parsed, userId]
  );

  if (!rows.length) throw createError(404, "Conta a pagar nao encontrada.");
  return rows[0];
};

export const getMatchCandidatesForBill = async (rawUserId, rawBillId) => {
  const userId = Number(rawUserId);
  const bill = await fetchBillForUser(userId, rawBillId);

  // No candidates for already-matched bills
  if (bill.match_status === "matched") {
    return {
      bill: formatBill(bill),
      candidates: [],
    };
  }

  // Search window: due_date ± 10 days, type = Saida, same user
  const { rows: transactions } = await dbQuery(
    `SELECT id, description, value, date
       FROM transactions
      WHERE user_id = $1
        AND type = 'Saida'
        AND date BETWEEN $2::date - INTERVAL '10 days' AND $2::date + INTERVAL '10 days'
      ORDER BY date ASC`,
    [userId, bill.due_date]
  );

  const candidates = transactions
    .map((tx) => {
      const scoreResult = scoreBillTransactionMatch(bill, tx);
      if (!scoreResult || scoreResult.score < SCORE_DISPLAY_THRESHOLD) return null;
      return {
        transactionId: tx.id,
        description: tx.description ?? null,
        amount: Number(tx.value),
        date: tx.date instanceof Date
          ? tx.date.toISOString().slice(0, 10)
          : String(tx.date).slice(0, 10),
        ...scoreResult,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return {
    bill: formatBill(bill),
    candidates,
  };
};

// ─── Confirm match ────────────────────────────────────────────────────────────

export const confirmBillMatch = async (rawUserId, rawBillId, input) => {
  const userId = Number(rawUserId);
  const bill = await fetchBillForUser(userId, rawBillId);

  if (bill.match_status === "matched") {
    throw createError(409, "Conta ja esta conciliada.");
  }

  const txId = Number(input.transactionId);
  if (!Number.isInteger(txId) || txId <= 0) {
    throw createError(400, "transactionId invalido.");
  }

  // Fetch the transaction — must belong to same user and be Saida
  const { rows: txRows } = await dbQuery(
    `SELECT id, value, date, description, type
       FROM transactions
      WHERE id = $1 AND user_id = $2`,
    [txId, userId]
  );

  if (!txRows.length) throw createError(404, "Transacao nao encontrada.");
  const tx = txRows[0];

  if (tx.type !== "Saida") {
    throw createError(422, "Apenas transacoes de saida podem ser conciliadas com contas a pagar.");
  }

  // Uniqueness: no other matched bill uses this transaction
  const { rows: conflict } = await dbQuery(
    `SELECT id FROM bills WHERE linked_transaction_id = $1 AND match_status = 'matched' AND id != $2`,
    [txId, bill.id]
  );
  if (conflict.length) {
    throw createError(409, "Esta transacao ja esta vinculada a outra conta.");
  }

  // Compute score for metadata
  const scoreResult = scoreBillTransactionMatch(bill, tx);
  const divergencePercent = scoreResult ? scoreResult.divergencePercent : 0;

  // Require explicit confirmation for divergence > 5%
  if (divergencePercent > 5 && !input.confirmDivergence) {
    throw createError(422, "Confirmacao de divergencia necessaria.", {
      publicCode: "DIVERGENCE_CONFIRMATION_REQUIRED",
      divergencePercent,
    });
  }

  const metadata = scoreResult
    ? {
        amountScore: scoreResult.amountScore,
        dateScore: scoreResult.dateScore,
        providerScore: scoreResult.providerScore,
        billAmount: Number(bill.amount),
        txAmount: Number(tx.value),
        divergencePercent,
        providerMatched: scoreResult.providerScore > 0,
      }
    : { billAmount: Number(bill.amount), txAmount: Number(tx.value), divergencePercent };

  let updated;
  try {
    const result = await dbQuery(
      `UPDATE bills
          SET linked_transaction_id = $1,
              match_status          = 'matched',
              matched_at            = NOW(),
              match_confidence      = $2,
              match_metadata        = $3,
              updated_at            = NOW()
        WHERE id = $4 AND user_id = $5
        RETURNING id, match_status, linked_transaction_id, matched_at, match_confidence`,
      [txId, scoreResult?.score ?? null, JSON.stringify(metadata), bill.id, userId]
    );
    updated = result.rows;
  } catch (err) {
    // Unique index violation: another concurrent request linked the same transaction first
    if (err.code === "23505") {
      throw createError(409, "Esta transacao ja esta vinculada a outra conta.");
    }
    throw err;
  }

  const row = updated[0];
  return {
    billId: row.id,
    matchStatus: row.match_status,
    linkedTransactionId: row.linked_transaction_id,
    matchedAt: row.matched_at,
    matchConfidence: row.match_confidence !== null ? Number(row.match_confidence) : null,
    divergencePercent,
  };
};

// ─── Unmatch (undo) ───────────────────────────────────────────────────────────

export const unmatchBill = async (rawUserId, rawBillId) => {
  const userId = Number(rawUserId);
  const bill = await fetchBillForUser(userId, rawBillId);

  if (bill.match_status === "unmatched") {
    throw createError(409, "Conta nao esta conciliada.");
  }

  await dbQuery(
    `UPDATE bills
        SET linked_transaction_id = NULL,
            match_status          = 'unmatched',
            matched_at            = NULL,
            match_confidence      = NULL,
            match_metadata        = '{}'::jsonb,
            updated_at            = NOW()
      WHERE id = $1 AND user_id = $2`,
    [bill.id, userId]
  );

  return { billId: bill.id, matchStatus: "unmatched" };
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatBill = (row) => ({
  id: row.id,
  title: row.title,
  amount: Number(row.amount),
  dueDate: row.due_date instanceof Date
    ? row.due_date.toISOString().slice(0, 10)
    : String(row.due_date).slice(0, 10),
  matchStatus: row.match_status,
  linkedTransactionId: row.linked_transaction_id ?? null,
});
