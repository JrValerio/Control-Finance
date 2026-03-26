import { api } from "./api";

export type TaxFactReviewStatus = "pending" | "approved" | "corrected" | "rejected";
export type TaxFactReviewAction = "approve" | "correct" | "reject";

export interface TaxSummaryWarning {
  code: string;
  message: string;
}

export interface TaxSummary {
  taxYear: number;
  exerciseYear: number;
  calendarYear: number;
  status: "generated" | "not_generated";
  snapshotVersion: number | null;
  mustDeclare: boolean | null;
  obligationReasons: string[];
  annualTaxableIncome: number;
  annualExemptIncome: number;
  annualExclusiveIncome: number;
  annualWithheldTax: number;
  totalLegalDeductions: number;
  simplifiedDiscountUsed: number;
  bestMethod: "legal_deductions" | "simplified_discount" | null;
  estimatedAnnualTax: number | null;
  warnings: TaxSummaryWarning[];
  sourceCounts: {
    documents: number;
    factsPending: number;
    factsApproved: number;
  };
  generatedAt: string | null;
}

export interface TaxObligationReason {
  code: string;
  message: string;
}

export interface TaxObligation {
  taxYear: number;
  exerciseYear: number;
  calendarYear: number;
  mustDeclare: boolean;
  reasons: TaxObligationReason[];
  thresholds: {
    taxableIncome: number;
    exemptAndExclusiveIncome: number;
    assets: number;
    ruralRevenue: number;
  };
  totals: {
    annualTaxableIncome: number;
    annualExemptIncome: number;
    annualExclusiveIncome: number;
    annualCombinedExemptAndExclusiveIncome: number;
    totalAssetBalance: number;
  };
  approvedFactsCount: number;
}

export interface TaxFact {
  id: number;
  taxYear: number;
  sourceDocumentId: number | null;
  factType: string;
  category: string;
  subcategory: string;
  payerName: string;
  payerDocument: string;
  referencePeriod: string;
  currency: string;
  amount: number;
  confidenceScore: number | null;
  dedupeStrength: string;
  reviewStatus: TaxFactReviewStatus;
  conflictCode: string | null;
  conflictMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  sourceDocument: {
    id: number;
    originalFileName: string;
    documentType: string;
    processingStatus: string;
    sourceLabel: string;
    uploadedAt: string | null;
  } | null;
}

export interface TaxFactsListResult {
  items: TaxFact[];
  page: number;
  pageSize: number;
  total: number;
}

interface TaxFactApiPayload {
  id?: unknown;
  taxYear?: unknown;
  sourceDocumentId?: unknown;
  factType?: unknown;
  category?: unknown;
  subcategory?: unknown;
  payerName?: unknown;
  payerDocument?: unknown;
  referencePeriod?: unknown;
  currency?: unknown;
  amount?: unknown;
  confidenceScore?: unknown;
  dedupeStrength?: unknown;
  reviewStatus?: unknown;
  conflictCode?: unknown;
  conflictMessage?: unknown;
  metadata?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  sourceDocument?: unknown;
}

const normalizeNumber = (value: unknown): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeNullableString = (value: unknown): string | null => {
  const normalizedValue = normalizeString(value);
  return normalizedValue || null;
};

const normalizeObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const normalizeWarning = (value: unknown): TaxSummaryWarning => {
  const raw = normalizeObject(value);

  return {
    code: normalizeString(raw.code),
    message: normalizeString(raw.message),
  };
};

const normalizeTaxFact = (value: unknown): TaxFact => {
  const raw = normalizeObject(value) as TaxFactApiPayload;
  const sourceDocumentRaw = normalizeObject(raw.sourceDocument);
  const sourceDocument =
    sourceDocumentRaw && Object.keys(sourceDocumentRaw).length > 0
      ? {
          id: normalizeNumber(sourceDocumentRaw.id),
          originalFileName: normalizeString(sourceDocumentRaw.originalFileName),
          documentType: normalizeString(sourceDocumentRaw.documentType),
          processingStatus: normalizeString(sourceDocumentRaw.processingStatus),
          sourceLabel: normalizeString(sourceDocumentRaw.sourceLabel),
          uploadedAt: normalizeNullableString(sourceDocumentRaw.uploadedAt),
        }
      : null;

  return {
    id: normalizeNumber(raw.id),
    taxYear: normalizeNumber(raw.taxYear),
    sourceDocumentId: normalizeNullableNumber(raw.sourceDocumentId),
    factType: normalizeString(raw.factType),
    category: normalizeString(raw.category),
    subcategory: normalizeString(raw.subcategory),
    payerName: normalizeString(raw.payerName),
    payerDocument: normalizeString(raw.payerDocument),
    referencePeriod: normalizeString(raw.referencePeriod),
    currency: normalizeString(raw.currency),
    amount: normalizeNumber(raw.amount),
    confidenceScore: normalizeNullableNumber(raw.confidenceScore),
    dedupeStrength: normalizeString(raw.dedupeStrength),
    reviewStatus: (normalizeString(raw.reviewStatus) as TaxFactReviewStatus) || "pending",
    conflictCode: normalizeNullableString(raw.conflictCode),
    conflictMessage: normalizeNullableString(raw.conflictMessage),
    metadata: normalizeObject(raw.metadata),
    createdAt: normalizeNullableString(raw.createdAt),
    updatedAt: normalizeNullableString(raw.updatedAt),
    sourceDocument,
  };
};

const normalizeSummary = (value: unknown): TaxSummary => {
  const raw = normalizeObject(value);

  return {
    taxYear: normalizeNumber(raw.taxYear),
    exerciseYear: normalizeNumber(raw.exerciseYear),
    calendarYear: normalizeNumber(raw.calendarYear),
    status: raw.status === "generated" ? "generated" : "not_generated",
    snapshotVersion: normalizeNullableNumber(raw.snapshotVersion),
    mustDeclare:
      typeof raw.mustDeclare === "boolean"
        ? raw.mustDeclare
        : raw.mustDeclare === null
          ? null
          : null,
    obligationReasons: Array.isArray(raw.obligationReasons)
      ? raw.obligationReasons.map((item) => normalizeString(item)).filter(Boolean)
      : [],
    annualTaxableIncome: normalizeNumber(raw.annualTaxableIncome),
    annualExemptIncome: normalizeNumber(raw.annualExemptIncome),
    annualExclusiveIncome: normalizeNumber(raw.annualExclusiveIncome),
    annualWithheldTax: normalizeNumber(raw.annualWithheldTax),
    totalLegalDeductions: normalizeNumber(raw.totalLegalDeductions),
    simplifiedDiscountUsed: normalizeNumber(raw.simplifiedDiscountUsed),
    bestMethod:
      raw.bestMethod === "legal_deductions" || raw.bestMethod === "simplified_discount"
        ? raw.bestMethod
        : null,
    estimatedAnnualTax:
      typeof raw.estimatedAnnualTax === "number" || typeof raw.estimatedAnnualTax === "string"
        ? normalizeNullableNumber(raw.estimatedAnnualTax)
        : null,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(normalizeWarning) : [],
    sourceCounts: {
      documents: normalizeNumber(normalizeObject(raw.sourceCounts).documents),
      factsPending: normalizeNumber(normalizeObject(raw.sourceCounts).factsPending),
      factsApproved: normalizeNumber(normalizeObject(raw.sourceCounts).factsApproved),
    },
    generatedAt: normalizeNullableString(raw.generatedAt),
  };
};

const normalizeReason = (value: unknown): TaxObligationReason => {
  const raw = normalizeObject(value);

  return {
    code: normalizeString(raw.code),
    message: normalizeString(raw.message),
  };
};

const normalizeObligation = (value: unknown): TaxObligation => {
  const raw = normalizeObject(value);
  const thresholds = normalizeObject(raw.thresholds);
  const totals = normalizeObject(raw.totals);

  return {
    taxYear: normalizeNumber(raw.taxYear),
    exerciseYear: normalizeNumber(raw.exerciseYear),
    calendarYear: normalizeNumber(raw.calendarYear),
    mustDeclare: Boolean(raw.mustDeclare),
    reasons: Array.isArray(raw.reasons) ? raw.reasons.map(normalizeReason) : [],
    thresholds: {
      taxableIncome: normalizeNumber(thresholds.taxableIncome),
      exemptAndExclusiveIncome: normalizeNumber(thresholds.exemptAndExclusiveIncome),
      assets: normalizeNumber(thresholds.assets),
      ruralRevenue: normalizeNumber(thresholds.ruralRevenue),
    },
    totals: {
      annualTaxableIncome: normalizeNumber(totals.annualTaxableIncome),
      annualExemptIncome: normalizeNumber(totals.annualExemptIncome),
      annualExclusiveIncome: normalizeNumber(totals.annualExclusiveIncome),
      annualCombinedExemptAndExclusiveIncome: normalizeNumber(
        totals.annualCombinedExemptAndExclusiveIncome,
      ),
      totalAssetBalance: normalizeNumber(totals.totalAssetBalance),
    },
    approvedFactsCount: normalizeNumber(raw.approvedFactsCount),
  };
};

export const taxService = {
  getSummary: async (taxYear: number): Promise<TaxSummary> => {
    const { data } = await api.get(`/tax/summary/${taxYear}`);
    return normalizeSummary(data);
  },

  rebuildSummary: async (taxYear: number): Promise<TaxSummary> => {
    const { data } = await api.post(`/tax/summary/${taxYear}/rebuild`);
    return normalizeSummary(data);
  },

  getObligation: async (taxYear: number): Promise<TaxObligation> => {
    const { data } = await api.get(`/tax/obligation/${taxYear}`);
    return normalizeObligation(data);
  },

  listFacts: async (params: {
    taxYear: number;
    reviewStatus?: TaxFactReviewStatus;
    page?: number;
    pageSize?: number;
  }): Promise<TaxFactsListResult> => {
    const { data } = await api.get("/tax/facts", {
      params: {
        taxYear: params.taxYear,
        reviewStatus: params.reviewStatus,
        page: params.page,
        pageSize: params.pageSize,
      },
    });
    const raw = normalizeObject(data);

    return {
      items: Array.isArray(raw.items) ? raw.items.map(normalizeTaxFact) : [],
      page: normalizeNumber(raw.page) || 1,
      pageSize: normalizeNumber(raw.pageSize) || 20,
      total: normalizeNumber(raw.total),
    };
  },

  reviewFact: async (
    factId: number,
    payload:
      | { action: "approve"; note?: string }
      | { action: "reject"; note?: string }
      | {
          action: "correct";
          note?: string;
          corrected: {
            amount?: number;
            category?: string;
            subcategory?: string;
            payerName?: string;
            payerDocument?: string;
            referencePeriod?: string;
          };
        },
  ): Promise<TaxFact> => {
    const { data } = await api.patch(`/tax/facts/${factId}/review`, payload);
    return normalizeTaxFact(normalizeObject(data).fact);
  },

  bulkApproveFacts: async (factIds: number[], note?: string): Promise<{ updatedCount: number }> => {
    const { data } = await api.post("/tax/facts/bulk-review", {
      factIds,
      action: "approve",
      note,
    });

    return {
      updatedCount: normalizeNumber(normalizeObject(data).updatedCount),
    };
  },
};
