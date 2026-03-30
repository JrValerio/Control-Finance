import { api } from "./api";

export interface CreditCardUsage {
  total: number;
  used: number;
  available: number;
  exceededBy: number;
  usagePct: number;
  status: "unused" | "using" | "exceeded";
}

export interface CreditCardPurchase {
  id: number;
  userId: number;
  creditCardId: number;
  billId: number | null;
  title: string;
  amount: number;
  purchaseDate: string;
  status: "open" | "billed";
  statementMonth: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardInvoice {
  id: number;
  title: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid";
  paidAt: string | null;
  referenceMonth: string | null;
  isOverdue: boolean;
}

export interface CreditCardItem {
  id: number;
  userId: number;
  name: string;
  limitTotal: number;
  closingDay: number;
  dueDay: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  usage: CreditCardUsage;
  openPurchasesCount: number;
  openPurchasesTotal: number;
  pendingInvoicesCount: number;
  pendingInvoicesTotal: number;
  openPurchases: CreditCardPurchase[];
  invoices: CreditCardInvoice[];
}

export interface CreditCardsListResult {
  items: CreditCardItem[];
}

export interface CreateCreditCardPayload {
  name: string;
  limitTotal: number;
  closingDay: number;
  dueDay: number;
  isActive?: boolean;
}

export type UpdateCreditCardPayload = Partial<CreateCreditCardPayload>;

export interface CreateCreditCardPurchasePayload {
  title: string;
  amount: number;
  purchaseDate: string;
  notes?: string | null;
  installmentCount?: number;
}

export interface CreateCreditCardInstallmentsResult {
  purchases: CreditCardPurchase[];
  installmentCount: number;
  totalAmount: number;
}

export interface CloseInvoiceResult {
  invoice: CreditCardInvoice;
  purchasesCount: number;
  total: number;
}

export interface ReopenInvoiceResult {
  invoiceId: number;
  reopenedPurchasesCount: number;
  success: boolean;
}

export type InvoiceParseConfidence = "high" | "low";

export interface CreditCardInvoicePdf {
  id: number;
  userId: number;
  creditCardId: number;
  issuer: string;
  cardLast4: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  totalAmount: number;
  minimumPayment: number | null;
  financedBalance: number | null;
  parseConfidence: InvoiceParseConfidence;
  parseMetadata: Record<string, unknown>;
  linkedBillId: number | null;
  createdAt: string;
  updatedAt: string;
}

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeStringOrNull = (value: unknown) => {
  const normalized = normalizeString(value);
  return normalized || null;
};

const normalizeUsage = (payload: Record<string, unknown> | null | undefined): CreditCardUsage => ({
  total: Number(payload?.total) || 0,
  used: Number(payload?.used) || 0,
  available: Number(payload?.available) || 0,
  exceededBy: Number(payload?.exceededBy) || 0,
  usagePct: Number(payload?.usagePct) || 0,
  status:
    payload?.status === "exceeded" || payload?.status === "using" || payload?.status === "unused"
      ? payload.status
      : "unused",
});

const normalizePurchase = (payload: Record<string, unknown>): CreditCardPurchase => ({
  id: Number(payload.id) || 0,
  userId: Number(payload.userId ?? payload.user_id) || 0,
  creditCardId: Number(payload.creditCardId ?? payload.credit_card_id) || 0,
  billId: payload.billId != null || payload.bill_id != null
    ? Number(payload.billId ?? payload.bill_id) || 0
    : null,
  title: normalizeString(payload.title),
  amount: Number(payload.amount) || 0,
  purchaseDate: normalizeString(payload.purchaseDate ?? payload.purchase_date),
  status: payload.status === "billed" ? "billed" : "open",
  statementMonth: normalizeStringOrNull(payload.statementMonth ?? payload.statement_month),
  installmentGroupId: normalizeStringOrNull(
    payload.installmentGroupId ?? payload.installment_group_id,
  ),
  installmentNumber:
    payload.installmentNumber != null || payload.installment_number != null
      ? Number(payload.installmentNumber ?? payload.installment_number) || 0
      : null,
  installmentCount:
    payload.installmentCount != null || payload.installment_count != null
      ? Number(payload.installmentCount ?? payload.installment_count) || 0
      : null,
  notes: normalizeStringOrNull(payload.notes),
  createdAt: normalizeString(payload.createdAt ?? payload.created_at),
  updatedAt: normalizeString(payload.updatedAt ?? payload.updated_at),
});

const normalizeInvoice = (payload: Record<string, unknown>): CreditCardInvoice => ({
  id: Number(payload.id) || 0,
  title: normalizeString(payload.title),
  amount: Number(payload.amount) || 0,
  dueDate: normalizeString(payload.dueDate ?? payload.due_date),
  status: payload.status === "paid" ? "paid" : "pending",
  paidAt: normalizeStringOrNull(payload.paidAt ?? payload.paid_at),
  referenceMonth: normalizeStringOrNull(payload.referenceMonth ?? payload.reference_month),
  isOverdue: Boolean(payload.isOverdue ?? payload.is_overdue),
});

const normalizeCard = (payload: Record<string, unknown>): CreditCardItem => ({
  id: Number(payload.id) || 0,
  userId: Number(payload.userId ?? payload.user_id) || 0,
  name: normalizeString(payload.name),
  limitTotal: Number(payload.limitTotal ?? payload.limit_total) || 0,
  closingDay: Number(payload.closingDay ?? payload.closing_day) || 0,
  dueDay: Number(payload.dueDay ?? payload.due_day) || 0,
  isActive: payload.isActive === false || payload.is_active === false ? false : true,
  createdAt: normalizeString(payload.createdAt ?? payload.created_at),
  updatedAt: normalizeString(payload.updatedAt ?? payload.updated_at),
  usage: normalizeUsage((payload.usage ?? null) as Record<string, unknown> | null),
  openPurchasesCount: Number(payload.openPurchasesCount ?? payload.open_purchases_count) || 0,
  openPurchasesTotal: Number(payload.openPurchasesTotal ?? payload.open_purchases_total) || 0,
  pendingInvoicesCount: Number(payload.pendingInvoicesCount ?? payload.pending_invoices_count) || 0,
  pendingInvoicesTotal: Number(payload.pendingInvoicesTotal ?? payload.pending_invoices_total) || 0,
  openPurchases: Array.isArray(payload.openPurchases)
    ? payload.openPurchases.map((item) => normalizePurchase(item as Record<string, unknown>))
    : [],
  invoices: Array.isArray(payload.invoices)
    ? payload.invoices.map((item) => normalizeInvoice(item as Record<string, unknown>))
    : [],
});

export const creditCardsService = {
  list: async (): Promise<CreditCardsListResult> => {
    const { data } = await api.get("/credit-cards");
    const raw = data as { items?: unknown[] };
    return {
      items: Array.isArray(raw.items)
        ? raw.items.map((item) => normalizeCard(item as Record<string, unknown>))
        : [],
    };
  },

  create: async (payload: CreateCreditCardPayload): Promise<CreditCardItem> => {
    const { data } = await api.post("/credit-cards", payload);
    return normalizeCard(data as Record<string, unknown>);
  },

  update: async (id: number, payload: UpdateCreditCardPayload): Promise<CreditCardItem> => {
    const { data } = await api.patch(`/credit-cards/${id}`, payload);
    return normalizeCard(data as Record<string, unknown>);
  },

  createPurchase: async (
    cardId: number,
    payload: CreateCreditCardPurchasePayload,
  ): Promise<CreditCardPurchase> => {
    const { data } = await api.post(`/credit-cards/${cardId}/purchases`, payload);
    return normalizePurchase(data as Record<string, unknown>);
  },

  createInstallments: async (
    cardId: number,
    payload: CreateCreditCardPurchasePayload & { installmentCount: number },
  ): Promise<CreateCreditCardInstallmentsResult> => {
    const { data } = await api.post(`/credit-cards/${cardId}/installments`, payload);
    const raw = data as {
      purchases?: Record<string, unknown>[];
      installmentCount?: unknown;
      totalAmount?: unknown;
    };
    return {
      purchases: Array.isArray(raw.purchases)
        ? raw.purchases.map((item) => normalizePurchase(item))
        : [],
      installmentCount: Number(raw.installmentCount) || 0,
      totalAmount: Number(raw.totalAmount) || 0,
    };
  },

  removePurchase: async (purchaseId: number): Promise<void> => {
    await api.delete(`/credit-cards/purchases/${purchaseId}`);
  },

  closeInvoice: async (cardId: number): Promise<CloseInvoiceResult> => {
    const { data } = await api.post(`/credit-cards/${cardId}/close-invoice`);
    const raw = data as { invoice?: Record<string, unknown>; purchasesCount?: unknown; total?: unknown };
    return {
      invoice: normalizeInvoice((raw.invoice ?? {}) as Record<string, unknown>),
      purchasesCount: Number(raw.purchasesCount) || 0,
      total: Number(raw.total) || 0,
    };
  },

  reopenInvoice: async (invoiceId: number): Promise<ReopenInvoiceResult> => {
    const { data } = await api.post(`/credit-cards/invoices/${invoiceId}/reopen`);
    const raw = data as {
      invoiceId?: unknown;
      reopenedPurchasesCount?: unknown;
      success?: unknown;
    };
    return {
      invoiceId: Number(raw.invoiceId) || 0,
      reopenedPurchasesCount: Number(raw.reopenedPurchasesCount) || 0,
      success: Boolean(raw.success),
    };
  },

  parseInvoicePdf: async (cardId: number, file: File): Promise<CreditCardInvoicePdf> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post(`/credit-cards/${cardId}/invoices/parse-pdf`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data as CreditCardInvoicePdf;
  },

  listInvoicesPdf: async (cardId: number): Promise<CreditCardInvoicePdf[]> => {
    const { data } = await api.get<CreditCardInvoicePdf[]>(`/credit-cards/${cardId}/invoices`);
    return data;
  },

  linkBillToInvoicePdf: async (
    cardId: number,
    invoiceId: number,
    billId: number
  ): Promise<CreditCardInvoicePdf> => {
    const { data } = await api.post<CreditCardInvoicePdf>(
      `/credit-cards/${cardId}/invoices/${invoiceId}/link-bill`,
      { billId }
    );
    return data;
  },
};
