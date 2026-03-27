import { api } from "./api";

export type TransactionType = "Entrada" | "Saida";

export interface Transaction {
  id: number;
  userId?: number;
  categoryId?: number | null;
  type: TransactionType;
  value: number;
  date: string;
  description?: string;
  notes?: string;
  createdAt?: string;
  deletedAt?: string | null;
}

export interface TransactionListOptions {
  includeDeleted?: boolean;
  type?: TransactionType;
  categoryId?: number;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
}

export interface TransactionsPageResult {
  data: Transaction[];
  meta: PaginationMeta;
}

export interface TransactionCreatePayload {
  type: TransactionType;
  value: number;
  date?: string;
  description?: string;
  notes?: string;
  category_id?: number | null;
}

export interface TransactionUpdatePayload {
  type?: TransactionType;
  value?: number;
  date?: string;
  description?: string;
  notes?: string;
  category_id?: number | null;
}

export interface CategoryOption {
  id: number;
  name: string;
}

export interface MonthlySummaryByCategory {
  categoryId: number | null;
  categoryName: string;
  expense: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  byCategory: MonthlySummaryByCategory[];
}

export interface MonthlySummaryCompareValues {
  income: number;
  expense: number;
  balance: number;
}

export interface MonthlySummaryCompareDelta extends MonthlySummaryCompareValues {
  incomePct: number | null;
  expensePct: number | null;
  balancePct: number | null;
}

export interface MonthlySummaryByCategoryDelta {
  categoryId: number | null;
  categoryName: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

export interface MonthlySummaryCompare {
  current: MonthlySummaryCompareValues;
  previous: MonthlySummaryCompareValues;
  delta: MonthlySummaryCompareDelta;
  byCategoryDelta: MonthlySummaryByCategoryDelta[];
}

export type MonthlyBudgetStatus = "ok" | "near_limit" | "exceeded";

export interface MonthlyBudget {
  id: number;
  categoryId: number;
  categoryName: string;
  month: string;
  budget: number;
  actual: number;
  remaining: number;
  percentage: number;
  status: MonthlyBudgetStatus;
}

export interface MonthlyBudgetUpsertPayload {
  categoryId: number;
  month: string;
  amount: number;
}

export interface ImportDryRunError {
  field: string;
  message: string;
}

export interface ImportDryRunRawRow {
  date: string;
  type: string;
  value: string;
  description: string;
  notes: string;
  category: string;
}

export interface ImportDryRunNormalizedRow {
  date: string;
  type: TransactionType;
  value: number;
  description: string;
  notes: string;
  categoryId: number | null;
}

export interface ImportDryRunConflict {
  type: "income_statement";
  statementId: number;
  sourceName: string | null;
  referenceMonth: string | null;
  paymentDate: string | null;
  netAmount: number;
  status: "draft" | "posted";
  postedTransactionId: number | null;
}

export interface ImportDryRunRow {
  line: number;
  status: "valid" | "invalid" | "duplicate" | "conflict";
  raw: ImportDryRunRawRow;
  normalized: ImportDryRunNormalizedRow | null;
  errors: ImportDryRunError[];
  statusDetail?: string | null;
  conflict?: ImportDryRunConflict | null;
}

export interface ImportDryRunSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  conflictRows: number;
  income: number;
  expense: number;
}

export interface ImportDryRunResult {
  importId: string;
  expiresAt: string;
  summary: ImportDryRunSummary;
  rows: ImportDryRunRow[];
}

export interface ImportCommitTransaction {
  id: number;
  line: number | null;
  type: string;
  value: number;
  date: string;
  description: string | null;
}

export interface ImportCommitResult {
  imported: number;
  importSessionId: string;
  createdTransactions: ImportCommitTransaction[];
  summary: {
    income: number;
    expense: number;
    balance: number;
  };
}

export interface ImportHistorySummary {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  conflictRows: number;
  invalidRows: number;
  income: number;
  expense: number;
  imported: number;
}

export interface ImportHistoryItem {
  id: string;
  createdAt: string;
  expiresAt: string;
  committedAt: string | null;
  fileName: string | null;
  documentType: string | null;
  canUndo: boolean;
  summary: ImportHistorySummary;
}

export interface ImportHistoryPagination {
  limit: number;
  offset: number;
}

export interface ImportHistoryResponse {
  items: ImportHistoryItem[];
  pagination: ImportHistoryPagination;
}

export interface ImportHistoryOptions {
  limit?: number;
  offset?: number;
}

export interface ImportCategoryRule {
  id: number;
  matchText: string;
  transactionType: TransactionType | null;
  categoryId: number;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
}

interface TransactionsApiResponse {
  data?: unknown;
  meta?: {
    page?: unknown;
    limit?: unknown;
    offset?: unknown;
    total?: unknown;
    totalPages?: unknown;
  };
}

interface CsvExportResult {
  blob: Blob;
  fileName: string;
}

interface MonthlySummaryApiResponse {
  month?: unknown;
  income?: unknown;
  expense?: unknown;
  balance?: unknown;
  byCategory?: Array<{
    categoryId?: unknown;
    categoryName?: unknown;
    expense?: unknown;
  }>;
}

interface MonthlySummaryCompareApiResponse {
  current?: {
    income?: unknown;
    expense?: unknown;
    balance?: unknown;
  };
  previous?: {
    income?: unknown;
    expense?: unknown;
    balance?: unknown;
  };
  delta?: {
    income?: unknown;
    expense?: unknown;
    balance?: unknown;
    incomePct?: unknown;
    expensePct?: unknown;
    balancePct?: unknown;
  };
  byCategoryDelta?: Array<{
    categoryId?: unknown;
    categoryName?: unknown;
    current?: unknown;
    previous?: unknown;
    delta?: unknown;
    deltaPct?: unknown;
  }>;
}

interface MonthlyBudgetsApiResponse {
  data?: Array<{
    id?: unknown;
    categoryId?: unknown;
    categoryName?: unknown;
    month?: unknown;
    budget?: unknown;
    actual?: unknown;
    remaining?: unknown;
    percentage?: unknown;
    status?: unknown;
  }>;
}

interface MonthlyBudgetUpsertApiResponse {
  id?: unknown;
  categoryId?: unknown;
  month?: unknown;
  amount?: unknown;
}

interface ImportDryRunApiResponse {
  importId?: unknown;
  expiresAt?: unknown;
  summary?: {
    totalRows?: unknown;
    validRows?: unknown;
    invalidRows?: unknown;
    duplicateRows?: unknown;
    conflictRows?: unknown;
    income?: unknown;
    expense?: unknown;
  };
  rows?: Array<{
    line?: unknown;
    status?: unknown;
    raw?: {
      date?: unknown;
      type?: unknown;
      value?: unknown;
      description?: unknown;
      notes?: unknown;
      category?: unknown;
    };
    normalized?: {
      date?: unknown;
      type?: unknown;
      value?: unknown;
      description?: unknown;
      notes?: unknown;
      categoryId?: unknown;
    } | null;
    errors?: Array<{
      field?: unknown;
      message?: unknown;
    }>;
    statusDetail?: unknown;
    conflict?: {
      type?: unknown;
      statementId?: unknown;
      sourceName?: unknown;
      referenceMonth?: unknown;
      paymentDate?: unknown;
      netAmount?: unknown;
      status?: unknown;
      postedTransactionId?: unknown;
    } | null;
  }>;
}

interface ImportCommitApiResponse {
  imported?: unknown;
  importSessionId?: unknown;
  createdTransactions?: Array<{
    id?: unknown;
    line?: unknown;
    type?: unknown;
    value?: unknown;
    date?: unknown;
    description?: unknown;
  }>;
  summary?: {
    income?: unknown;
    expense?: unknown;
    balance?: unknown;
  };
}

interface ImportHistoryApiResponse {
  items?: Array<{
    id?: unknown;
    createdAt?: unknown;
    expiresAt?: unknown;
    committedAt?: unknown;
    fileName?: unknown;
    documentType?: unknown;
    canUndo?: unknown;
    summary?: {
      totalRows?: unknown;
      validRows?: unknown;
      duplicateRows?: unknown;
      conflictRows?: unknown;
      invalidRows?: unknown;
      income?: unknown;
      expense?: unknown;
      imported?: unknown;
    };
  }>;
  pagination?: {
    limit?: unknown;
    offset?: unknown;
  };
}

const buildTransactionParams = (options: TransactionListOptions = {}): Record<string, string> => {
  const params: Record<string, string> = {};

  if (options.includeDeleted === true) {
    params.includeDeleted = "true";
  }

  if (options.type) {
    params.type = options.type;
  }

  if (typeof options.categoryId === "number" && Number.isInteger(options.categoryId) && options.categoryId > 0) {
    params.categoryId = String(options.categoryId);
  }

  if (options.from) {
    params.from = options.from;
  }

  if (options.to) {
    params.to = options.to;
  }

  if (typeof options.q === "string" && options.q.trim()) {
    params.q = options.q.trim();
  }

  if (typeof options.sort === "string" && options.sort.trim()) {
    params.sort = options.sort.trim();
  }

  if (typeof options.page === "number" && Number.isInteger(options.page) && options.page > 0) {
    params.page = String(options.page);
  }

  if (typeof options.limit === "number" && Number.isInteger(options.limit) && options.limit > 0) {
    params.limit = String(options.limit);
  }

  if (typeof options.offset === "number" && Number.isInteger(options.offset) && options.offset >= 0) {
    params.offset = String(options.offset);
  }

  return params;
};

const resolveCsvFilename = (contentDispositionHeader: unknown): string => {
  if (typeof contentDispositionHeader !== "string") {
    return "";
  }

  const fileNameMatch = contentDispositionHeader.match(
    /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i,
  );

  if (!fileNameMatch) {
    return "";
  }

  const fileName = fileNameMatch[1] || fileNameMatch[2] || "";

  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null) {
    return null;
  }

  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : null;
};

export const transactionsService = {
  listPage: async (options: TransactionListOptions = {}): Promise<TransactionsPageResult> => {
    const params = buildTransactionParams(options);
    const { data } = await api.get("/transactions", { params });
    const responseBody = data as TransactionsApiResponse;
    const page = Number(responseBody?.meta?.page);
    const limit = Number(responseBody?.meta?.limit);
    const offset = Number(responseBody?.meta?.offset);
    const total = Number(responseBody?.meta?.total);
    const totalPages = Number(responseBody?.meta?.totalPages);
    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const normalizedOffset =
      Number.isInteger(offset) && offset >= 0
        ? offset
        : (normalizedPage - 1) * normalizedLimit;

    return {
      data: Array.isArray(responseBody?.data) ? (responseBody.data as Transaction[]) : [],
      meta: {
        page: normalizedPage,
        limit: normalizedLimit,
        offset: normalizedOffset,
        total: Number.isInteger(total) && total >= 0 ? total : 0,
        totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1,
      },
    };
  },
  listCategories: async (): Promise<CategoryOption[]> => {
    const { data } = await api.get("/categories");

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((category) => ({
        id: Number((category as { id?: unknown }).id),
        name: String((category as { name?: unknown }).name || "").trim(),
      }))
      .filter((category) => Number.isInteger(category.id) && category.id > 0 && category.name);
  },
  getMonthlySummary: async (month: string): Promise<MonthlySummary> => {
    const { data } = await api.get("/transactions/summary", {
      params: { month },
    });
    const responseBody = data as MonthlySummaryApiResponse;
    const byCategory = Array.isArray(responseBody.byCategory)
      ? responseBody.byCategory.map((item) => {
          const numericCategoryId = Number(item?.categoryId);

          return {
            categoryId:
              Number.isInteger(numericCategoryId) && numericCategoryId > 0
                ? numericCategoryId
                : null,
            categoryName:
              typeof item?.categoryName === "string" && item.categoryName.trim()
                ? item.categoryName.trim()
                : "Sem categoria",
            expense: Number(item?.expense) || 0,
          };
        })
      : [];

    return {
      month:
        typeof responseBody.month === "string" && responseBody.month.trim()
          ? responseBody.month.trim()
          : month,
      income: Number(responseBody.income) || 0,
      expense: Number(responseBody.expense) || 0,
      balance: Number(responseBody.balance) || 0,
      byCategory,
    };
  },
  getMonthlySummaryCompare: async (month: string): Promise<MonthlySummaryCompare> => {
    const { data } = await api.get("/transactions/summary", {
      params: { month, compare: "prev" },
    });
    const responseBody = data as MonthlySummaryCompareApiResponse;
    const byCategoryDelta = Array.isArray(responseBody.byCategoryDelta)
      ? responseBody.byCategoryDelta.map((item) => {
          const numericCategoryId = Number(item?.categoryId);

          return {
            categoryId:
              Number.isInteger(numericCategoryId) && numericCategoryId > 0
                ? numericCategoryId
                : null,
            categoryName:
              typeof item?.categoryName === "string" && item.categoryName.trim()
                ? item.categoryName.trim()
                : "Sem categoria",
            current: Number(item?.current) || 0,
            previous: Number(item?.previous) || 0,
            delta: Number(item?.delta) || 0,
            deltaPct: normalizeNullableNumber(item?.deltaPct),
          };
        })
      : [];

    return {
      current: {
        income: Number(responseBody.current?.income) || 0,
        expense: Number(responseBody.current?.expense) || 0,
        balance: Number(responseBody.current?.balance) || 0,
      },
      previous: {
        income: Number(responseBody.previous?.income) || 0,
        expense: Number(responseBody.previous?.expense) || 0,
        balance: Number(responseBody.previous?.balance) || 0,
      },
      delta: {
        income: Number(responseBody.delta?.income) || 0,
        expense: Number(responseBody.delta?.expense) || 0,
        balance: Number(responseBody.delta?.balance) || 0,
        incomePct: normalizeNullableNumber(responseBody.delta?.incomePct),
        expensePct: normalizeNullableNumber(responseBody.delta?.expensePct),
        balancePct: normalizeNullableNumber(responseBody.delta?.balancePct),
      },
      byCategoryDelta,
    };
  },
  getMonthlyBudgets: async (month: string): Promise<MonthlyBudget[]> => {
    const { data } = await api.get("/budgets", {
      params: { month },
    });
    const responseBody = data as MonthlyBudgetsApiResponse;

    if (!Array.isArray(responseBody?.data)) {
      return [];
    }

    return responseBody.data
      .map((item) => {
        const normalizedId = Number(item?.id);
        const normalizedCategoryId = Number(item?.categoryId);
        const normalizedStatus = String(item?.status || "").trim().toLowerCase();

        return {
          id: Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : 0,
          categoryId:
            Number.isInteger(normalizedCategoryId) && normalizedCategoryId > 0
              ? normalizedCategoryId
              : 0,
          categoryName:
            typeof item?.categoryName === "string" && item.categoryName.trim()
              ? item.categoryName.trim()
              : "Sem categoria",
          month: typeof item?.month === "string" && item.month.trim() ? item.month.trim() : month,
          budget: Number(item?.budget) || 0,
          actual: Number(item?.actual) || 0,
          remaining: Number(item?.remaining) || 0,
          percentage: Number(item?.percentage) || 0,
          status:
            normalizedStatus === "near_limit" || normalizedStatus === "exceeded"
              ? (normalizedStatus as MonthlyBudgetStatus)
              : "ok",
        };
      })
      .filter((item) => item.id > 0 && item.categoryId > 0);
  },
  createOrUpdateMonthlyBudget: async (
    payload: MonthlyBudgetUpsertPayload,
  ): Promise<MonthlyBudget> => {
    const { data } = await api.post("/budgets", payload);
    const responseBody = data as MonthlyBudgetUpsertApiResponse;
    const normalizedId = Number(responseBody?.id);
    const normalizedCategoryId = Number(responseBody?.categoryId);
    const normalizedAmount = Number(responseBody?.amount);
    const resolvedBudgetAmount =
      Number.isFinite(normalizedAmount) && normalizedAmount > 0 ? normalizedAmount : payload.amount;

    return {
      id: Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : 0,
      categoryId:
        Number.isInteger(normalizedCategoryId) && normalizedCategoryId > 0
          ? normalizedCategoryId
          : payload.categoryId,
      categoryName: "Sem categoria",
      month:
        typeof responseBody?.month === "string" && responseBody.month.trim()
          ? responseBody.month.trim()
          : payload.month,
      budget: Number(resolvedBudgetAmount.toFixed(2)),
      actual: 0,
      remaining: 0,
      percentage: 0,
      status: "ok",
    };
  },
  deleteMonthlyBudget: async (id: number): Promise<void> => {
    await api.delete(`/budgets/${id}`);
  },
  create: async (payload: TransactionCreatePayload): Promise<Transaction> => {
    const { data } = await api.post("/transactions", payload);
    return data as Transaction;
  },
  update: async (id: number, payload: TransactionUpdatePayload): Promise<Transaction> => {
    const { data } = await api.patch(`/transactions/${id}`, payload);
    return data as Transaction;
  },
  remove: async (id: number): Promise<{ id: number; success: boolean }> => {
    const { data } = await api.delete(`/transactions/${id}`);
    return data as { id: number; success: boolean };
  },
  restore: async (id: number): Promise<Transaction> => {
    const { data } = await api.post(`/transactions/${id}/restore`);
    return data as Transaction;
  },
  exportCsv: async (options: TransactionListOptions = {}): Promise<CsvExportResult> => {
    const params = buildTransactionParams(options);
    const response = await api.get("/transactions/export.csv", {
      params,
      responseType: "blob",
    });

    return {
      blob: response.data as Blob,
      fileName: resolveCsvFilename(response.headers?.["content-disposition"]),
    };
  },
  dryRunImportCsv: async (file: File): Promise<ImportDryRunResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await api.post("/transactions/import/dry-run", formData);
    const responseBody = data as ImportDryRunApiResponse;
    const rows = Array.isArray(responseBody.rows)
      ? responseBody.rows.map((row) => {
          const normalizedStatus: ImportDryRunRow["status"] =
            row?.status === "valid" ||
            row?.status === "duplicate" ||
            row?.status === "conflict"
              ? row.status
              : "invalid";
          const numericLine = Number(row?.line);
          const normalized = row?.normalized;
          const normalizedType = String(normalized?.type || "").trim();
          const numericNormalizedCategoryId = Number(normalized?.categoryId);
          const conflict = row?.conflict;
          const numericStatementId = Number(conflict?.statementId);
          const numericPostedTransactionId = Number(conflict?.postedTransactionId);
          const normalizedConflictType = String(conflict?.type || "").trim();
          const normalizedConflictStatus = String(conflict?.status || "").trim();
          const conflictStatus: ImportDryRunConflict["status"] =
            normalizedConflictStatus === "posted" ? "posted" : "draft";

          return {
            line: Number.isInteger(numericLine) && numericLine >= 2 ? numericLine : 0,
            status: normalizedStatus,
            raw: {
              date: String(row?.raw?.date || ""),
              type: String(row?.raw?.type || ""),
              value: String(row?.raw?.value || ""),
              description: String(row?.raw?.description || ""),
              notes: String(row?.raw?.notes || ""),
              category: String(row?.raw?.category || ""),
            },
            normalized:
              normalized && (normalizedType === "Entrada" || normalizedType === "Saida")
                ? {
                    date: String(normalized.date || ""),
                    type: normalizedType as TransactionType,
                    value: Number(normalized.value) || 0,
                    description: String(normalized.description || ""),
                    notes: String(normalized.notes || ""),
                    categoryId:
                      Number.isInteger(numericNormalizedCategoryId) &&
                      numericNormalizedCategoryId > 0
                        ? numericNormalizedCategoryId
                        : null,
                  }
                : null,
            errors: Array.isArray(row?.errors)
              ? row.errors.map((error) => ({
                  field: String(error?.field || ""),
                  message: String(error?.message || ""),
                }))
              : [],
            statusDetail:
              typeof row?.statusDetail === "string" && row.statusDetail.trim()
                ? row.statusDetail
                : null,
            conflict:
              normalizedConflictType === "income_statement" &&
              Number.isInteger(numericStatementId) &&
              numericStatementId > 0
                ? {
                    type: "income_statement" as const,
                    statementId: numericStatementId,
                    sourceName:
                      typeof conflict?.sourceName === "string" && conflict.sourceName.trim()
                        ? conflict.sourceName
                        : null,
                    referenceMonth:
                      typeof conflict?.referenceMonth === "string" &&
                      conflict.referenceMonth.trim()
                        ? conflict.referenceMonth
                        : null,
                    paymentDate:
                      typeof conflict?.paymentDate === "string" && conflict.paymentDate.trim()
                        ? conflict.paymentDate
                        : null,
                    netAmount: Number(conflict?.netAmount) || 0,
                    status: conflictStatus,
                    postedTransactionId:
                      Number.isInteger(numericPostedTransactionId) &&
                      numericPostedTransactionId > 0
                        ? numericPostedTransactionId
                        : null,
                  }
                : null,
          };
        })
      : [];

    return {
      importId: String(responseBody.importId || ""),
      expiresAt: String(responseBody.expiresAt || ""),
      summary: {
        totalRows: Number(responseBody.summary?.totalRows) || 0,
        validRows: Number(responseBody.summary?.validRows) || 0,
        invalidRows: Number(responseBody.summary?.invalidRows) || 0,
        duplicateRows: Number(responseBody.summary?.duplicateRows) || 0,
        conflictRows: Number(responseBody.summary?.conflictRows) || 0,
        income: Number(responseBody.summary?.income) || 0,
        expense: Number(responseBody.summary?.expense) || 0,
      },
      rows,
    };
  },
  listImportCategoryRules: async (): Promise<ImportCategoryRule[]> => {
    const { data } = await api.get("/transactions/import/rules");
    const items = Array.isArray((data as { items?: unknown[] })?.items)
      ? ((data as { items?: unknown[] }).items as unknown[])
      : [];

    return items.map((item) => {
      const transactionType = String((item as { transactionType?: unknown })?.transactionType || "")
        .trim();

      return {
        id: Number((item as { id?: unknown })?.id) || 0,
        matchText: String((item as { matchText?: unknown })?.matchText || ""),
        transactionType:
          transactionType === "Entrada" || transactionType === "Saida"
            ? (transactionType as TransactionType)
            : null,
        categoryId: Number((item as { categoryId?: unknown })?.categoryId) || 0,
        categoryName: String((item as { categoryName?: unknown })?.categoryName || ""),
        createdAt: String((item as { createdAt?: unknown })?.createdAt || ""),
        updatedAt: String((item as { updatedAt?: unknown })?.updatedAt || ""),
      };
    });
  },
  createImportCategoryRule: async (payload: {
    matchText: string;
    categoryId: number;
    transactionType?: TransactionType;
  }): Promise<ImportCategoryRule> => {
    const { data } = await api.post("/transactions/import/rules", payload);
    const response = data as {
      id?: unknown;
      matchText?: unknown;
      transactionType?: unknown;
      categoryId?: unknown;
      categoryName?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    const transactionType = String(response.transactionType || "").trim();

    return {
      id: Number(response.id) || 0,
      matchText: String(response.matchText || ""),
      transactionType:
        transactionType === "Entrada" || transactionType === "Saida"
          ? (transactionType as TransactionType)
          : null,
      categoryId: Number(response.categoryId) || 0,
      categoryName: String(response.categoryName || ""),
      createdAt: String(response.createdAt || ""),
      updatedAt: String(response.updatedAt || ""),
    };
  },
  deleteImportCategoryRule: async (ruleId: number): Promise<{ id: number; success: boolean }> => {
    const { data } = await api.delete(`/transactions/import/rules/${ruleId}`);
    return {
      id: Number((data as { id?: unknown })?.id) || 0,
      success: Boolean((data as { success?: unknown })?.success),
    };
  },
  commitImportCsv: async (
    importId: string,
    categoryOverrides: { line: number; categoryId: number | null }[] = [],
  ): Promise<ImportCommitResult> => {
    const { data } = await api.post("/transactions/import/commit", { importId, categoryOverrides });
    const responseBody = data as ImportCommitApiResponse;

    const createdTransactions: ImportCommitTransaction[] = Array.isArray(
      responseBody.createdTransactions,
    )
      ? responseBody.createdTransactions.map((tx) => ({
          id: Number(tx.id) || 0,
          line: tx.line != null ? Number(tx.line) : null,
          type: typeof tx.type === "string" ? tx.type : "",
          value: Number(tx.value) || 0,
          date: typeof tx.date === "string" ? tx.date : "",
          description: typeof tx.description === "string" ? tx.description : null,
        }))
      : [];

    return {
      imported: Number(responseBody.imported) || 0,
      importSessionId: String(responseBody.importSessionId || ""),
      createdTransactions,
      summary: {
        income: Number(responseBody.summary?.income) || 0,
        expense: Number(responseBody.summary?.expense) || 0,
        balance: Number(responseBody.summary?.balance) || 0,
      },
    };
  },
  deleteImportSession: async (sessionId: string): Promise<{ importSessionId: string; deletedCount: number; success: boolean }> => {
    const { data } = await api.delete(`/transactions/imports/${sessionId}`);
    return data as { importSessionId: string; deletedCount: number; success: boolean };
  },
  bulkDeleteTransactions: async (transactionIds: number[]): Promise<{ deletedCount: number; success: boolean }> => {
    const { data } = await api.post("/transactions/bulk-delete", { transactionIds });
    return data as { deletedCount: number; success: boolean };
  },
  getImportHistory: async (options: ImportHistoryOptions = {}): Promise<ImportHistoryResponse> => {
    const fallbackLimit =
      Number.isInteger(options.limit) && (options.limit as number) > 0 ? (options.limit as number) : 20;
    const fallbackOffset =
      Number.isInteger(options.offset) && (options.offset as number) >= 0
        ? (options.offset as number)
        : 0;
    const { data } = await api.get("/transactions/imports", {
      params: {
        limit: fallbackLimit,
        offset: fallbackOffset,
      },
    });
    const responseBody = data as ImportHistoryApiResponse;
    const items = Array.isArray(responseBody.items)
      ? responseBody.items.map((item) => ({
          id: String(item?.id || ""),
          createdAt: String(item?.createdAt || ""),
          expiresAt: String(item?.expiresAt || ""),
          committedAt:
            typeof item?.committedAt === "string" && item.committedAt.trim()
              ? item.committedAt
              : null,
          fileName:
            typeof item?.fileName === "string" && item.fileName.trim()
              ? item.fileName.trim()
              : null,
          documentType:
            typeof item?.documentType === "string" && item.documentType.trim()
              ? item.documentType.trim()
              : null,
          canUndo: Boolean(item?.canUndo),
          summary: {
            totalRows: Number(item?.summary?.totalRows) || 0,
            validRows: Number(item?.summary?.validRows) || 0,
            duplicateRows: Number(item?.summary?.duplicateRows) || 0,
            conflictRows: Number(item?.summary?.conflictRows) || 0,
            invalidRows: Number(item?.summary?.invalidRows) || 0,
            income: Number(item?.summary?.income) || 0,
            expense: Number(item?.summary?.expense) || 0,
            imported: Number(item?.summary?.imported) || 0,
          },
        }))
      : [];
    const responseLimit = Number(responseBody.pagination?.limit);
    const responseOffset = Number(responseBody.pagination?.offset);

    return {
      items: items.filter((item) => Boolean(item.id)),
      pagination: {
        limit: Number.isInteger(responseLimit) && responseLimit > 0 ? responseLimit : fallbackLimit,
        offset:
          Number.isInteger(responseOffset) && responseOffset >= 0
            ? responseOffset
            : fallbackOffset,
      },
    };
  },
};
