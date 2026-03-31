import { dbQuery, withDbTransaction } from "../db/index.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CREDIT_CARD_INVOICE_BILL_TYPE = "credit_card_invoice";
const MIN_INSTALLMENT_COUNT = 2;
const MAX_INSTALLMENT_COUNT = 24;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
};

const normalizeCardId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de cartao invalido.");
  }
  return parsed;
};

const normalizePurchaseId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de compra invalido.");
  }
  return parsed;
};

const normalizeInvoiceId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de fatura invalido.");
  }
  return parsed;
};

const normalizeName = (value) => {
  if (!value || !String(value).trim()) {
    throw createError(400, "Nome do cartao e obrigatorio.");
  }

  const trimmed = String(value).trim();
  if (trimmed.length > 120) {
    throw createError(400, "Nome do cartao muito longo.");
  }

  return trimmed;
};

const normalizeAmount = (value, fieldName = "Valor") => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} invalido. Informe um numero maior que zero.`);
  }

  return Number(parsed.toFixed(2));
};

const normalizeDay = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    throw createError(400, `${fieldName} deve ser um inteiro entre 1 e 31.`);
  }
  return parsed;
};

const normalizeOptionalBoolean = (value) => {
  if (value === undefined) return undefined;
  return Boolean(value);
};

const normalizePurchaseDate = (value) => {
  if (!isValidISODate(value)) {
    throw createError(400, "Data da compra invalida. Use YYYY-MM-DD.");
  }
  return value;
};

const normalizeInstallmentCount = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw createError(400, "Informe entre 2 e 24 parcelas.");
    }
    return 1;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_INSTALLMENT_COUNT || parsed > MAX_INSTALLMENT_COUNT) {
    throw createError(400, "Informe entre 2 e 24 parcelas.");
  }

  return parsed;
};

const normalizeOptionalText = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const trimmed = String(value).trim();
  if (trimmed.length > 500) {
    throw createError(400, `${fieldName} muito longo.`);
  }
  return trimmed || null;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

const toISODate = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toISODateTime = (value) => {
  if (typeof value === "string") return value;
  return new Date(value).toISOString();
};

const toISODateOnly = (value) => {
  if (typeof value === "string") return value;
  return new Date(value).toISOString().slice(0, 10);
};

const clampDateDay = (year, monthIndex, day) => {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
};

const addMonthsClamped = (isoDate, n) => {
  const [yearPart, monthPart, dayPart] = isoDate.split("-").map(Number);
  const targetYear = yearPart + Math.floor((monthPart - 1 + n) / 12);
  const targetMonth = ((monthPart - 1 + n) % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(dayPart, lastDay);
  return [
    targetYear,
    String(targetMonth).padStart(2, "0"),
    String(clampedDay).padStart(2, "0"),
  ].join("-");
};

const splitInstallmentAmounts = (totalAmount, installmentCount) => {
  const totalCents = Math.round(normalizeAmount(totalAmount, "Valor da compra") * 100);
  const baseAmountCents = Math.floor(totalCents / installmentCount);
  const remainder = totalCents % installmentCount;

  return Array.from({ length: installmentCount }, (_, index) =>
    Number(((baseAmountCents + (index < remainder ? 1 : 0)) / 100).toFixed(2)),
  );
};

const buildInstallmentGroupId = (userId, cardId) =>
  `cc_install_${userId}_${cardId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const resolveNextDueDate = (closingDate, dueDay) => {
  const [yearPart, monthPart, dayPart] = closingDate.split("-").map(Number);
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (dueDay > day) {
    return clampDateDay(year, month - 1, dueDay);
  }

  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  return clampDateDay(nextMonthDate.getUTCFullYear(), nextMonthDate.getUTCMonth(), dueDay);
};

const resolveEffectiveClosingDay = (closingDate, configuredClosingDay) => {
  const [yearPart, monthPart] = closingDate.split("-").map(Number);
  const lastDayOfMonth = new Date(Date.UTC(yearPart, monthPart, 0)).getUTCDate();
  return Math.min(configuredClosingDay, lastDayOfMonth);
};

const mapCardRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  name: row.name,
  limitTotal: toMoney(row.limit_total),
  closingDay: Number(row.closing_day),
  dueDay: Number(row.due_day),
  isActive: Boolean(row.is_active),
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapPurchaseRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  creditCardId: Number(row.credit_card_id),
  billId: row.bill_id != null ? Number(row.bill_id) : null,
  title: row.title,
  amount: toMoney(row.amount),
  purchaseDate: toISODateOnly(row.purchase_date),
  status: row.status,
  statementMonth: row.statement_month || null,
  installmentGroupId: row.installment_group_id || null,
  installmentNumber:
    row.installment_number != null ? Number(row.installment_number) : null,
  installmentCount:
    row.installment_count != null ? Number(row.installment_count) : null,
  notes: row.notes || null,
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapInvoiceRow = (row) => {
  const dueDate =
    typeof row.due_date === "string" ? row.due_date : new Date(row.due_date).toISOString().slice(0, 10);

  const today = toISODate();

  return {
    id: Number(row.id),
    title: row.title,
    amount: toMoney(row.amount),
    dueDate,
    status: row.status,
    paidAt: row.paid_at ? toISODateTime(row.paid_at) : null,
    referenceMonth: row.reference_month || null,
    isOverdue: row.status === "pending" && dueDate < today,
  };
};

const buildCardUsage = (cardLimit, purchases, invoicesById) => {
  const openPurchasesTotal = purchases
    .filter((purchase) => purchase.status === "open")
    .reduce((sum, purchase) => sum + purchase.amount, 0);

  const billedPendingTotal = purchases
    .filter((purchase) => {
      if (purchase.status !== "billed") return false;
      if (purchase.billId == null) return true;
      const invoice = invoicesById.get(purchase.billId);
      return !invoice || invoice.status !== "paid";
    })
    .reduce((sum, purchase) => sum + purchase.amount, 0);

  const used = toMoney(openPurchasesTotal + billedPendingTotal);
  const total = toMoney(cardLimit);
  const available = toMoney(Math.max(total - used, 0));
  const exceededBy = toMoney(Math.max(used - total, 0));
  const usagePct = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;

  return {
    total,
    used,
    available,
    exceededBy,
    usagePct,
    status: exceededBy > 0 ? "exceeded" : used > 0 ? "using" : "unused",
  };
};

const getCardForUserOrThrow = async (client, userId, cardId) => {
  const result = await client.query(
    `SELECT * FROM credit_cards WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [cardId, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Cartao nao encontrado.");
  }

  return result.rows[0];
};

export const listCreditCardsByUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const cardsResult = await dbQuery(
    `SELECT * FROM credit_cards
     WHERE user_id = $1
     ORDER BY is_active DESC, created_at DESC, id DESC`,
    [normalizedUserId],
  );

  const cards = cardsResult.rows.map(mapCardRow);

  if (cards.length === 0) {
    return { items: [] };
  }

  const [purchasesResult, invoicesResult] = await Promise.all([
    dbQuery(
      `SELECT * FROM credit_card_purchases
       WHERE user_id = $1
       ORDER BY purchase_date DESC, id DESC`,
      [normalizedUserId],
    ),
    dbQuery(
      `SELECT * FROM bills
       WHERE user_id = $1
         AND credit_card_id IS NOT NULL
         AND bill_type = $2
       ORDER BY due_date DESC, id DESC`,
      [normalizedUserId, CREDIT_CARD_INVOICE_BILL_TYPE],
    ),
  ]);

  const purchases = purchasesResult.rows.map(mapPurchaseRow);
  const invoicesWithCardId = invoicesResult.rows.map((row) => ({
    creditCardId: Number(row.credit_card_id),
    invoice: mapInvoiceRow(row),
  }));
  const invoices = invoicesWithCardId.map((entry) => entry.invoice);
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const items = cards.map((card) => {
    const cardPurchases = purchases.filter((purchase) => purchase.creditCardId === card.id);
    const cardInvoices = invoicesWithCardId
      .filter((entry) => entry.creditCardId === card.id)
      .map((entry) => entry.invoice);
    const usage = buildCardUsage(card.limitTotal, cardPurchases, invoicesById);
    const openPurchases = cardPurchases.filter((purchase) => purchase.status === "open");
    const pendingInvoices = cardInvoices.filter((invoice) => invoice.status === "pending");

    return {
      ...card,
      usage,
      openPurchasesCount: openPurchases.length,
      openPurchasesTotal: toMoney(openPurchases.reduce((sum, purchase) => sum + purchase.amount, 0)),
      pendingInvoicesCount: pendingInvoices.length,
      pendingInvoicesTotal: toMoney(pendingInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)),
      openPurchases,
      invoices: cardInvoices,
    };
  });

  return { items };
};

export const createCreditCardForUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const name = normalizeName(payload.name);
  const limitTotal = normalizeAmount(payload.limitTotal, "Limite");
  const closingDay = normalizeDay(payload.closingDay, "closingDay");
  const dueDay = normalizeDay(payload.dueDay, "dueDay");
  const isActive = payload.isActive === undefined ? true : Boolean(payload.isActive);

  const result = await dbQuery(
    `INSERT INTO credit_cards (user_id, name, limit_total, closing_day, due_day, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [normalizedUserId, name, limitTotal, closingDay, dueDay, isActive],
  );

  return mapCardRow(result.rows[0]);
};

export const updateCreditCardForUser = async (userId, cardId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCardId = normalizeCardId(cardId);

  const updates = [];
  const params = [normalizedCardId, normalizedUserId];
  let paramIndex = 3;

  if (payload.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(normalizeName(payload.name));
  }

  if (payload.limitTotal !== undefined) {
    updates.push(`limit_total = $${paramIndex++}`);
    params.push(normalizeAmount(payload.limitTotal, "Limite"));
  }

  if (payload.closingDay !== undefined) {
    updates.push(`closing_day = $${paramIndex++}`);
    params.push(normalizeDay(payload.closingDay, "closingDay"));
  }

  if (payload.dueDay !== undefined) {
    updates.push(`due_day = $${paramIndex++}`);
    params.push(normalizeDay(payload.dueDay, "dueDay"));
  }

  const isActive = normalizeOptionalBoolean(payload.isActive);
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    params.push(isActive);
  }

  if (updates.length === 0) {
    throw createError(400, "Nenhum campo para atualizar.");
  }

  const result = await dbQuery(
    `UPDATE credit_cards
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw createError(404, "Cartao nao encontrado.");
  }

  return mapCardRow(result.rows[0]);
};

export const createCreditCardPurchaseForUser = async (userId, cardId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCardId = normalizeCardId(cardId);
  const title = normalizeName(payload.title);
  const amount = normalizeAmount(payload.amount, "Valor da compra");
  const purchaseDate = normalizePurchaseDate(payload.purchaseDate);
  const notes = normalizeOptionalText(payload.notes, "Notas");

  return withDbTransaction(async (client) => {
    const card = await getCardForUserOrThrow(client, normalizedUserId, normalizedCardId);

    if (!card.is_active) {
      throw createError(409, "Cartao inativo. Reative antes de lancar compras.");
    }

    const result = await client.query(
      `INSERT INTO credit_card_purchases (
         user_id,
         credit_card_id,
         title,
         amount,
         purchase_date,
         notes
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [normalizedUserId, normalizedCardId, title, amount, purchaseDate, notes ?? null],
    );

    return mapPurchaseRow(result.rows[0]);
  });
};

export const createCreditCardInstallmentsForUser = async (userId, cardId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCardId = normalizeCardId(cardId);
  const title = normalizeName(payload.title);
  const totalAmount = normalizeAmount(payload.amount, "Valor da compra");
  const purchaseDate = normalizePurchaseDate(payload.purchaseDate);
  const notes = normalizeOptionalText(payload.notes, "Notas");
  const installmentCount = normalizeInstallmentCount(payload.installmentCount, { required: true });
  const installmentAmounts = splitInstallmentAmounts(totalAmount, installmentCount);
  const installmentGroupId = buildInstallmentGroupId(normalizedUserId, normalizedCardId);

  return withDbTransaction(async (client) => {
    const card = await getCardForUserOrThrow(client, normalizedUserId, normalizedCardId);

    if (!card.is_active) {
      throw createError(409, "Cartao inativo. Reative antes de lancar compras.");
    }

    const purchases = [];
    for (let index = 0; index < installmentCount; index += 1) {
      const result = await client.query(
        `INSERT INTO credit_card_purchases (
           user_id,
           credit_card_id,
           title,
           amount,
           purchase_date,
           notes,
           installment_group_id,
           installment_number,
           installment_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          normalizedUserId,
          normalizedCardId,
          title,
          installmentAmounts[index],
          addMonthsClamped(purchaseDate, index),
          notes ?? null,
          installmentGroupId,
          index + 1,
          installmentCount,
        ],
      );
      purchases.push(mapPurchaseRow(result.rows[0]));
    }

    return {
      purchases,
      installmentCount,
      totalAmount,
    };
  });
};

export const deleteCreditCardPurchaseForUser = async (userId, purchaseId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPurchaseId = normalizePurchaseId(purchaseId);

  return withDbTransaction(async (client) => {
    const result = await client.query(
      `SELECT * FROM credit_card_purchases
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [normalizedPurchaseId, normalizedUserId],
    );

    if (result.rows.length === 0) {
      throw createError(404, "Compra nao encontrada.");
    }

    const purchase = result.rows[0];

    if (purchase.installment_group_id) {
      const groupResult = await client.query(
        `SELECT id, status
           FROM credit_card_purchases
          WHERE user_id = $1
            AND installment_group_id = $2
          ORDER BY installment_number ASC, id ASC`,
        [normalizedUserId, purchase.installment_group_id],
      );

      const hasBilledInstallment = groupResult.rows.some((row) => row.status !== "open");
      if (hasBilledInstallment) {
        throw createError(
          409,
          "Compra parcelada ja entrou em fatura fechada e nao pode ser excluida por completo.",
        );
      }

      await client.query(
        `DELETE FROM credit_card_purchases
          WHERE user_id = $1
            AND installment_group_id = $2`,
        [normalizedUserId, purchase.installment_group_id],
      );

      return {
        id: normalizedPurchaseId,
        deletedCount: groupResult.rows.length,
      };
    }

    if (purchase.status !== "open") {
      throw createError(409, "Compra ja entrou em fatura fechada e nao pode ser excluida.");
    }

    await client.query(
      `DELETE FROM credit_card_purchases WHERE id = $1 AND user_id = $2`,
      [normalizedPurchaseId, normalizedUserId],
    );

    return { id: normalizedPurchaseId };
  });
};

export const closeCreditCardInvoiceForUser = async (userId, cardId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCardId = normalizeCardId(cardId);
  const closingDate = payload.closingDate ? normalizePurchaseDate(payload.closingDate) : toISODate();

  return withDbTransaction(async (client) => {
    const card = await getCardForUserOrThrow(client, normalizedUserId, normalizedCardId);
    const mappedCard = mapCardRow(card);

    const effectiveClosingDay = resolveEffectiveClosingDay(closingDate, mappedCard.closingDay);
    const closingDayReached = Number(closingDate.slice(-2)) >= effectiveClosingDay;
    if (!closingDayReached) {
      throw createError(409, "Ainda nao chegou o dia de fechamento deste cartao.");
    }

    const statementMonth = closingDate.slice(0, 7);

    const existingInvoiceResult = await client.query(
      `SELECT id
       FROM bills
       WHERE user_id = $1
         AND credit_card_id = $2
         AND bill_type = $3
         AND reference_month = $4
       LIMIT 1`,
      [normalizedUserId, normalizedCardId, CREDIT_CARD_INVOICE_BILL_TYPE, statementMonth],
    );

    if (existingInvoiceResult.rows.length > 0) {
      throw createError(409, "Fatura deste mes ja foi fechada.");
    }

    const purchasesResult = await client.query(
      `SELECT *
       FROM credit_card_purchases
       WHERE user_id = $1
         AND credit_card_id = $2
         AND status = 'open'
         AND purchase_date <= $3
       ORDER BY purchase_date ASC, id ASC`,
      [normalizedUserId, normalizedCardId, closingDate],
    );

    if (purchasesResult.rows.length === 0) {
      throw createError(409, "Nao ha compras abertas para fechar na fatura.");
    }

    const purchases = purchasesResult.rows.map(mapPurchaseRow);
    const invoiceAmount = toMoney(purchases.reduce((sum, purchase) => sum + purchase.amount, 0));
    const dueDate = resolveNextDueDate(closingDate, mappedCard.dueDay);

    const invoiceResult = await client.query(
      `INSERT INTO bills (
         user_id,
         title,
         amount,
         due_date,
         provider,
         reference_month,
         bill_type,
         credit_card_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        normalizedUserId,
        `Fatura ${mappedCard.name} ${statementMonth}`,
        invoiceAmount,
        dueDate,
        mappedCard.name,
        statementMonth,
        CREDIT_CARD_INVOICE_BILL_TYPE,
        normalizedCardId,
      ],
    );

    const invoice = invoiceResult.rows[0];

    await client.query(
      `UPDATE credit_card_purchases
       SET status = 'billed',
           statement_month = $3,
           bill_id = $4,
           updated_at = NOW()
       WHERE user_id = $1
         AND credit_card_id = $2
         AND status = 'open'
         AND purchase_date <= $5`,
      [normalizedUserId, normalizedCardId, statementMonth, invoice.id, closingDate],
    );

    return {
      invoice: mapInvoiceRow(invoice),
      purchasesCount: purchases.length,
      total: invoiceAmount,
    };
  });
};

export const reopenCreditCardInvoiceForUser = async (userId, invoiceId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedInvoiceId = normalizeInvoiceId(invoiceId);

  return withDbTransaction(async (client) => {
    const invoiceResult = await client.query(
      `SELECT *
         FROM bills
        WHERE id = $1
          AND user_id = $2
          AND bill_type = $3
          AND credit_card_id IS NOT NULL
        LIMIT 1`,
      [normalizedInvoiceId, normalizedUserId, CREDIT_CARD_INVOICE_BILL_TYPE],
    );

    if (invoiceResult.rows.length === 0) {
      throw createError(404, "Fatura nao encontrada.");
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status !== "pending") {
      throw createError(409, "Apenas faturas pendentes podem ser reabertas.");
    }

    const purchasesResult = await client.query(
      `SELECT id
         FROM credit_card_purchases
        WHERE user_id = $1
          AND bill_id = $2
        ORDER BY id ASC`,
      [normalizedUserId, normalizedInvoiceId],
    );

    if (purchasesResult.rows.length > 0) {
      await client.query(
        `UPDATE credit_card_purchases
            SET status = 'open',
                statement_month = NULL,
                bill_id = NULL,
                updated_at = NOW()
          WHERE user_id = $1
            AND bill_id = $2`,
        [normalizedUserId, normalizedInvoiceId],
      );
    }

    await client.query(
      `DELETE FROM bills
        WHERE id = $1
          AND user_id = $2`,
      [normalizedInvoiceId, normalizedUserId],
    );

    return {
      invoiceId: normalizedInvoiceId,
      reopenedPurchasesCount: purchasesResult.rows.length,
      success: true,
    };
  });
};

export const CREDIT_CARD_BILL_TYPE = CREDIT_CARD_INVOICE_BILL_TYPE;
