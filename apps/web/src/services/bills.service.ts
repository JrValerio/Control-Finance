import { api } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export type BillStatus = "pending" | "paid";
export type BillStatusFilter = "pending" | "paid" | "overdue" | undefined;

export interface Bill {
  id: number;
  userId: number;
  title: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  isOverdue: boolean;
  categoryId: number | null;
  paidAt: string | null;
  notes: string | null;
  provider: string | null;
  referenceMonth: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillsSummary {
  pendingCount: number;
  pendingTotal: number;
  overdueCount: number;
  overdueTotal: number;
}

export interface BillsListResult {
  items: Bill[];
  pagination: { limit: number; offset: number; total: number };
}

export interface CreateBillPayload {
  title: string;
  amount: number;
  dueDate: string;
  categoryId?: number | null;
  notes?: string | null;
  provider?: string | null;
  referenceMonth?: string | null;
}

export type UpdateBillPayload = Partial<CreateBillPayload>;

export interface BillsBatchResult {
  bills: unknown[];
}

export interface MarkPaidResult {
  bill: Bill;
  transaction: {
    id: number;
    type: string;
    value: number;
    date: string;
    description: string | null;
  };
}

// ─── Raw API payload type ─────────────────────────────────────────────────────

interface BillApiPayload {
  id?: unknown;
  userId?: unknown;
  user_id?: unknown;
  title?: unknown;
  amount?: unknown;
  dueDate?: unknown;
  due_date?: unknown;
  status?: unknown;
  isOverdue?: unknown;
  is_overdue?: unknown;
  categoryId?: unknown;
  category_id?: unknown;
  paidAt?: unknown;
  paid_at?: unknown;
  notes?: unknown;
  provider?: unknown;
  referenceMonth?: unknown;
  reference_month?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
}

// ─── Normalization ────────────────────────────────────────────────────────────

const normalizeStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeISOString = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
};

const normalizeBill = (raw: BillApiPayload): Bill => {
  const id = Number(raw.id);
  const userId = Number(raw.userId ?? raw.user_id);
  const amount = Number(raw.amount);
  const categoryId = raw.categoryId ?? raw.category_id;
  const categoryIdNum = categoryId != null && categoryId !== "" ? Number(categoryId) : null;

  return {
    id: Number.isInteger(id) && id > 0 ? id : 0,
    userId: Number.isInteger(userId) && userId > 0 ? userId : 0,
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    amount: Number.isFinite(amount) ? amount : 0,
    dueDate: normalizeISOString(raw.dueDate ?? raw.due_date),
    status: raw.status === "paid" ? "paid" : "pending",
    isOverdue: Boolean(raw.isOverdue ?? raw.is_overdue),
    categoryId:
      categoryIdNum != null && Number.isInteger(categoryIdNum) && categoryIdNum > 0
        ? categoryIdNum
        : null,
    paidAt: normalizeStringOrNull(raw.paidAt ?? raw.paid_at),
    notes: normalizeStringOrNull(raw.notes),
    provider: normalizeStringOrNull(raw.provider),
    referenceMonth: normalizeStringOrNull(raw.referenceMonth ?? raw.reference_month),
    createdAt: normalizeISOString(raw.createdAt ?? raw.created_at),
    updatedAt: normalizeISOString(raw.updatedAt ?? raw.updated_at),
  };
};

const isValidBill = (bill: Bill): boolean =>
  bill.id > 0 && bill.userId > 0 && Boolean(bill.title);

// ─── Service ──────────────────────────────────────────────────────────────────

export const billsService = {
  getSummary: async (): Promise<BillsSummary> => {
    const { data } = await api.get("/bills/summary");
    const raw = data as Record<string, unknown>;
    return {
      pendingCount: Number(raw.pendingCount) || 0,
      pendingTotal: Number(raw.pendingTotal) || 0,
      overdueCount: Number(raw.overdueCount) || 0,
      overdueTotal: Number(raw.overdueTotal) || 0,
    };
  },

  list: async (opts: {
    status?: BillStatusFilter;
    limit?: number;
    offset?: number;
  } = {}): Promise<BillsListResult> => {
    const params: Record<string, string | number> = {};
    if (opts.status) params.status = opts.status;
    if (opts.limit != null) params.limit = opts.limit;
    if (opts.offset != null) params.offset = opts.offset;

    const { data } = await api.get("/bills", { params });
    const raw = data as { items?: unknown[]; pagination?: Record<string, unknown> };

    const items = Array.isArray(raw.items)
      ? raw.items.map((item) => normalizeBill(item as BillApiPayload)).filter(isValidBill)
      : [];

    const pagination = {
      limit: Number(raw.pagination?.limit) || 20,
      offset: Number(raw.pagination?.offset) || 0,
      total: Number(raw.pagination?.total) || 0,
    };

    return { items, pagination };
  },

  create: async (payload: CreateBillPayload): Promise<Bill> => {
    const { data } = await api.post("/bills", payload);
    return normalizeBill(data as BillApiPayload);
  },

  update: async (id: number, payload: UpdateBillPayload): Promise<Bill> => {
    const { data } = await api.patch(`/bills/${id}`, payload);
    return normalizeBill(data as BillApiPayload);
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/bills/${id}`);
  },

  createBatch: async (bills: CreateBillPayload[]): Promise<Bill[]> => {
    const { data } = await api.post<BillsBatchResult>("/bills/batch", { bills });
    return (data.bills as BillApiPayload[]).map(normalizeBill);
  },

  markPaid: async (id: number, opts: { paidAt?: string } = {}): Promise<MarkPaidResult> => {
    const { data } = await api.patch(`/bills/${id}/mark-paid`, opts);
    const raw = data as { bill?: unknown; transaction?: unknown };
    const tx = raw.transaction as Record<string, unknown> | undefined;
    return {
      bill: normalizeBill(raw.bill as BillApiPayload),
      transaction: {
        id: Number(tx?.id) || 0,
        type: typeof tx?.type === "string" ? tx.type : "",
        value: Number(tx?.value) || 0,
        date: typeof tx?.date === "string" ? tx.date : "",
        description: typeof tx?.description === "string" ? tx.description : null,
      },
    };
  },
};
