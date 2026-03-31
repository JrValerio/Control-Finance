import { api } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export type BillStatus = "pending" | "paid";
export type BillOperationalBucket = "paid" | "overdue" | "due_soon" | "future";
export type BillStatusFilter = "pending" | "paid" | "overdue" | "due_soon" | "future" | undefined;
export type MatchStatus = "unmatched" | "matched";

export interface Bill {
  id: number;
  userId: number;
  title: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  isOverdue: boolean;
  operationalBucket: BillOperationalBucket;
  daysUntilDue: number | null;
  categoryId: number | null;
  paidAt: string | null;
  notes: string | null;
  provider: string | null;
  referenceMonth: string | null;
  billType: string | null;
  sourceImportSessionId: string | null;
  matchStatus: MatchStatus;
  linkedTransactionId: number | null;
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
  billType?: string | null;
  sourceImportSessionId?: string | null;
}

export type UpdateBillPayload = Partial<CreateBillPayload>;

export interface BillsBatchResult {
  bills: unknown[];
}

export interface UtilityPanelSummary {
  totalPending: number;
  totalAmount: number;
  overdueCount: number;
  overdueAmount: number;
  dueSoonCount: number;
  dueSoonAmount: number;
}

export interface UtilityPanel {
  overdue: Bill[];
  dueSoon: Bill[];
  upcoming: Bill[];
  summary: UtilityPanelSummary;
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

export interface MatchCandidate {
  transactionId: number;
  description: string | null;
  amount: number;
  date: string;
  score: number;
  amountScore: number;
  dateScore: number;
  providerScore: number;
  divergencePercent: number;
  requiresDivergenceConfirmation: boolean;
}

export interface MatchCandidatesBill {
  id: number;
  title: string;
  amount: number;
  dueDate: string;
  matchStatus: MatchStatus;
  linkedTransactionId: number | null;
}

export interface MatchCandidatesResult {
  bill: MatchCandidatesBill;
  candidates: MatchCandidate[];
}

export interface ConfirmMatchResult {
  billId: number;
  matchStatus: MatchStatus;
  linkedTransactionId: number;
  matchedAt: string;
  matchConfidence: number | null;
  divergencePercent: number;
}

export interface UnmatchResult {
  billId: number;
  matchStatus: MatchStatus;
}

export interface DivergenceConfirmationError {
  code: "DIVERGENCE_CONFIRMATION_REQUIRED";
  divergencePercent: number;
  message: string;
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
  operationalBucket?: unknown;
  operational_bucket?: unknown;
  daysUntilDue?: unknown;
  days_until_due?: unknown;
  categoryId?: unknown;
  category_id?: unknown;
  paidAt?: unknown;
  paid_at?: unknown;
  notes?: unknown;
  provider?: unknown;
  referenceMonth?: unknown;
  reference_month?: unknown;
  billType?: unknown;
  bill_type?: unknown;
  sourceImportSessionId?: unknown;
  source_import_session_id?: unknown;
  matchStatus?: unknown;
  linkedTransactionId?: unknown;
  linked_transaction_id?: unknown;
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

const toDayStart = (value: string): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const fallbackDaysUntilDue = (dueDate: string): number | null => {
  const dueDateStart = toDayStart(dueDate);
  if (!dueDateStart) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((dueDateStart.getTime() - today.getTime()) / millisecondsPerDay);
};

const normalizeOperationalBucket = (
  value: unknown,
  fallback: BillOperationalBucket,
): BillOperationalBucket => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    normalized === "paid" ||
    normalized === "overdue" ||
    normalized === "due_soon" ||
    normalized === "future"
  ) {
    return normalized;
  }
  return fallback;
};

const normalizeBill = (raw: BillApiPayload): Bill => {
  const id = Number(raw.id);
  const userId = Number(raw.userId ?? raw.user_id);
  const amount = Number(raw.amount);
  const categoryId = raw.categoryId ?? raw.category_id;
  const categoryIdNum = categoryId != null && categoryId !== "" ? Number(categoryId) : null;
  const dueDate = normalizeISOString(raw.dueDate ?? raw.due_date);
  const isOverdue = Boolean(raw.isOverdue ?? raw.is_overdue);
  const status: BillStatus = raw.status === "paid" ? "paid" : "pending";
  const normalizedDaysUntilDueRaw = Number(raw.daysUntilDue ?? raw.days_until_due);
  const daysUntilDue =
    status === "pending"
      ? Number.isInteger(normalizedDaysUntilDueRaw)
        ? normalizedDaysUntilDueRaw
        : fallbackDaysUntilDue(dueDate)
      : null;
  const fallbackBucket: BillOperationalBucket =
    status === "paid"
      ? "paid"
      : isOverdue
        ? "overdue"
        : daysUntilDue != null && daysUntilDue <= 7
          ? "due_soon"
          : "future";

  return {
    id: Number.isInteger(id) && id > 0 ? id : 0,
    userId: Number.isInteger(userId) && userId > 0 ? userId : 0,
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    amount: Number.isFinite(amount) ? amount : 0,
    dueDate,
    status,
    isOverdue,
    operationalBucket: normalizeOperationalBucket(
      raw.operationalBucket ?? raw.operational_bucket,
      fallbackBucket,
    ),
    daysUntilDue,
    categoryId:
      categoryIdNum != null && Number.isInteger(categoryIdNum) && categoryIdNum > 0
        ? categoryIdNum
        : null,
    paidAt: normalizeStringOrNull(raw.paidAt ?? raw.paid_at),
    notes: normalizeStringOrNull(raw.notes),
    provider: normalizeStringOrNull(raw.provider),
    referenceMonth: normalizeStringOrNull(raw.referenceMonth ?? raw.reference_month),
    billType: normalizeStringOrNull(raw.billType ?? raw.bill_type),
    sourceImportSessionId: normalizeStringOrNull(raw.sourceImportSessionId ?? raw.source_import_session_id),
    matchStatus: raw.matchStatus === "matched" ? "matched" : "unmatched",
    linkedTransactionId: (() => {
      const v = raw.linkedTransactionId ?? raw.linked_transaction_id;
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    })(),
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
    if (opts.status) {
      if (opts.status === "due_soon" || opts.status === "future") {
        params.bucket = opts.status;
      } else {
        params.status = opts.status;
      }
    }
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

  getUtilityPanel: async (): Promise<UtilityPanel> => {
    const { data } = await api.get<{
      overdue: BillApiPayload[];
      dueSoon: BillApiPayload[];
      upcoming: BillApiPayload[];
      summary: UtilityPanelSummary;
    }>("/bills/utility-panel");
    return {
      overdue: (data.overdue ?? []).map(normalizeBill).filter(isValidBill),
      dueSoon: (data.dueSoon ?? []).map(normalizeBill).filter(isValidBill),
      upcoming: (data.upcoming ?? []).map(normalizeBill).filter(isValidBill),
      summary: {
        totalPending: Number(data.summary?.totalPending) || 0,
        totalAmount: Number(data.summary?.totalAmount) || 0,
        overdueCount: Number(data.summary?.overdueCount) || 0,
        overdueAmount: Number(data.summary?.overdueAmount) || 0,
        dueSoonCount: Number(data.summary?.dueSoonCount) || 0,
        dueSoonAmount: Number(data.summary?.dueSoonAmount) || 0,
      },
    };
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

  getMatchCandidates: async (billId: number): Promise<MatchCandidatesResult> => {
    const { data } = await api.get<MatchCandidatesResult>(`/bills/${billId}/match-candidates`);
    return data;
  },

  confirmMatch: async (
    billId: number,
    transactionId: number,
    confirmDivergence = false
  ): Promise<ConfirmMatchResult> => {
    const { data } = await api.post<ConfirmMatchResult>(`/bills/${billId}/confirm-match`, {
      transactionId,
      confirmDivergence,
    });
    return data;
  },

  unmatch: async (billId: number): Promise<UnmatchResult> => {
    const { data } = await api.delete<UnmatchResult>(`/bills/${billId}/match`);
    return data;
  },
};
