import { api } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface IncomeSource {
  id: number;
  userId: number;
  name: string;
  categoryId: number | null;
  defaultDay: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeDeduction {
  id: number;
  incomeSourceId: number;
  label: string;
  amount: number;
  isVariable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeStatementDeduction {
  id: number;
  statementId: number;
  label: string;
  amount: number;
  isVariable: boolean;
}

export interface IncomeStatement {
  id: number;
  incomeSourceId: number;
  referenceMonth: string;
  netAmount: number;
  totalDeductions: number;
  grossAmount: number | null;
  details: Record<string, unknown> | null;
  paymentDate: string | null;
  status: "draft" | "posted";
  postedTransactionId: number | null;
  sourceImportSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeSourceWithDeductions extends IncomeSource {
  deductions: IncomeDeduction[];
}

export interface IncomeStatementWithDeductions {
  statement: IncomeStatement;
  deductions: IncomeStatementDeduction[];
}

export interface PostStatementResult {
  statement: IncomeStatement;
  transaction: {
    id: number;
    type: string;
    value: number;
    date: string;
    description: string | null;
    categoryId: number | null;
  };
}

export interface CreateIncomeSourcePayload {
  name: string;
  categoryId?: number | null;
  defaultDay?: number | null;
  notes?: string | null;
}

export type UpdateIncomeSourcePayload = Partial<CreateIncomeSourcePayload>;

export interface CreateDeductionPayload {
  label: string;
  amount: number;
  isVariable?: boolean;
}

export type UpdateDeductionPayload = Partial<CreateDeductionPayload & { isActive: boolean }>;

export interface CreateStatementPayload {
  referenceMonth: string;
  netAmount: number;
  paymentDate?: string | null;
  grossAmount?: number | null;
  details?: Record<string, unknown> | null;
  sourceImportSessionId?: string | null;
}

// ─── Raw API payload types ─────────────────────────────────────────────────────

interface RawSource {
  id?: unknown;
  userId?: unknown;
  name?: unknown;
  categoryId?: unknown;
  defaultDay?: unknown;
  notes?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  deductions?: unknown;
}

interface RawDeduction {
  id?: unknown;
  incomeSourceId?: unknown;
  label?: unknown;
  amount?: unknown;
  isVariable?: unknown;
  isActive?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface RawStatementDeduction {
  id?: unknown;
  statementId?: unknown;
  label?: unknown;
  amount?: unknown;
  isVariable?: unknown;
}

interface RawStatement {
  id?: unknown;
  incomeSourceId?: unknown;
  referenceMonth?: unknown;
  netAmount?: unknown;
  totalDeductions?: unknown;
  grossAmount?: unknown;
  details?: unknown;
  paymentDate?: unknown;
  status?: unknown;
  postedTransactionId?: unknown;
  sourceImportSessionId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ─── Normalization ─────────────────────────────────────────────────────────────

const normalizeISOString = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
};

const normalizeStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeIntOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeStatementDeduction = (raw: RawStatementDeduction): IncomeStatementDeduction => ({
  id: Number(raw.id) || 0,
  statementId: Number(raw.statementId) || 0,
  label: typeof raw.label === "string" ? raw.label : "",
  amount: Number(raw.amount) || 0,
  isVariable: Boolean(raw.isVariable),
});

const normalizeDeduction = (raw: RawDeduction): IncomeDeduction => ({
  id: Number(raw.id) || 0,
  incomeSourceId: Number(raw.incomeSourceId) || 0,
  label: typeof raw.label === "string" ? raw.label : "",
  amount: Number(raw.amount) || 0,
  isVariable: Boolean(raw.isVariable),
  isActive: raw.isActive !== false,
  createdAt: normalizeISOString(raw.createdAt),
  updatedAt: normalizeISOString(raw.updatedAt),
});

const normalizeStatement = (raw: RawStatement): IncomeStatement => ({
  id: Number(raw.id) || 0,
  incomeSourceId: Number(raw.incomeSourceId) || 0,
  referenceMonth: typeof raw.referenceMonth === "string" ? raw.referenceMonth : "",
  netAmount: Number(raw.netAmount) || 0,
  totalDeductions: Number(raw.totalDeductions) || 0,
  grossAmount: raw.grossAmount != null ? Number(raw.grossAmount) || null : null,
  details: raw.details != null && typeof raw.details === "object" && !Array.isArray(raw.details)
    ? (raw.details as Record<string, unknown>)
    : null,
  paymentDate: normalizeStringOrNull(raw.paymentDate),
  status: raw.status === "posted" ? "posted" : "draft",
  postedTransactionId: normalizeIntOrNull(raw.postedTransactionId),
  sourceImportSessionId: normalizeStringOrNull(raw.sourceImportSessionId),
  createdAt: normalizeISOString(raw.createdAt),
  updatedAt: normalizeISOString(raw.updatedAt),
});

const normalizeSource = (raw: RawSource): IncomeSourceWithDeductions => {
  const deductions = Array.isArray(raw.deductions)
    ? (raw.deductions as RawDeduction[]).map(normalizeDeduction)
    : [];
  return {
    id: Number(raw.id) || 0,
    userId: Number(raw.userId) || 0,
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    categoryId: normalizeIntOrNull(raw.categoryId),
    defaultDay: normalizeIntOrNull(raw.defaultDay),
    notes: normalizeStringOrNull(raw.notes),
    createdAt: normalizeISOString(raw.createdAt),
    updatedAt: normalizeISOString(raw.updatedAt),
    deductions,
  };
};

const normalizeStatementWithDeductions = (raw: {
  statement?: unknown;
  deductions?: unknown;
}): IncomeStatementWithDeductions => {
  const stmt = raw.statement as RawStatement;
  const deds = Array.isArray(raw.deductions)
    ? (raw.deductions as RawStatementDeduction[]).map(normalizeStatementDeduction)
    : [];
  return { statement: normalizeStatement(stmt ?? {}), deductions: deds };
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const incomeSourcesService = {
  list: async (): Promise<IncomeSourceWithDeductions[]> => {
    const { data } = await api.get("/income-sources");
    const raw = data as { sources?: unknown[] };
    return Array.isArray(raw.sources)
      ? (raw.sources as RawSource[]).map(normalizeSource)
      : [];
  },

  create: async (payload: CreateIncomeSourcePayload): Promise<IncomeSourceWithDeductions> => {
    const { data } = await api.post("/income-sources", payload);
    return normalizeSource(data as RawSource);
  },

  update: async (id: number, payload: UpdateIncomeSourcePayload): Promise<IncomeSourceWithDeductions> => {
    const { data } = await api.patch(`/income-sources/${id}`, payload);
    return normalizeSource(data as RawSource);
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/income-sources/${id}`);
  },

  addDeduction: async (sourceId: number, payload: CreateDeductionPayload): Promise<IncomeDeduction> => {
    const { data } = await api.post(`/income-sources/${sourceId}/deductions`, payload);
    return normalizeDeduction(data as RawDeduction);
  },

  updateDeduction: async (deductionId: number, payload: UpdateDeductionPayload): Promise<IncomeDeduction> => {
    const { data } = await api.patch(`/income-sources/deductions/${deductionId}`, payload);
    return normalizeDeduction(data as RawDeduction);
  },

  removeDeduction: async (deductionId: number): Promise<void> => {
    await api.delete(`/income-sources/deductions/${deductionId}`);
  },

  createStatement: async (
    sourceId: number,
    payload: CreateStatementPayload,
  ): Promise<IncomeStatementWithDeductions> => {
    const { data } = await api.post(`/income-sources/${sourceId}/statements`, payload);
    return normalizeStatementWithDeductions(data as { statement?: unknown; deductions?: unknown });
  },

  updateStatement: async (
    statementId: number,
    payload: {
      netAmount?: number;
      paymentDate?: string | null;
      deductions?: Array<{ id: number; amount: number }>;
    },
  ): Promise<IncomeStatementWithDeductions> => {
    const { data } = await api.patch(`/income-sources/statements/${statementId}`, payload);
    return normalizeStatementWithDeductions(data as { statement?: unknown; deductions?: unknown });
  },

  linkTransaction: async (
    statementId: number,
    transactionId: number,
  ): Promise<IncomeStatement> => {
    const { data } = await api.post(
      `/income-sources/statements/${statementId}/link-transaction`,
      { transactionId },
    );
    const raw = data as { statement?: unknown };
    return normalizeStatement((raw.statement ?? data) as RawStatement);
  },

  postStatement: async (statementId: number): Promise<PostStatementResult> => {
    const { data } = await api.post(`/income-sources/statements/${statementId}/post`);
    const raw = data as {
      statement?: RawStatement;
      transaction?: {
        id?: unknown;
        type?: unknown;
        value?: unknown;
        date?: unknown;
        description?: unknown;
        categoryId?: unknown;
      };
    };
    const tx = raw.transaction ?? {};
    return {
      statement: normalizeStatement(raw.statement ?? {}),
      transaction: {
        id: Number(tx.id) || 0,
        type: typeof tx.type === "string" ? tx.type : "",
        value: Number(tx.value) || 0,
        date: typeof tx.date === "string" ? tx.date : "",
        description: typeof tx.description === "string" ? tx.description : null,
        categoryId: normalizeIntOrNull(tx.categoryId),
      },
    };
  },

  listStatements: async (sourceId: number): Promise<IncomeStatement[]> => {
    const { data } = await api.get(`/income-sources/${sourceId}/statements`);
    const raw = data as { statements?: RawStatement[] };
    return Array.isArray(raw.statements)
      ? raw.statements.map(normalizeStatement)
      : [];
  },
};
