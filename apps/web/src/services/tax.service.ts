import { api } from "./api";

export type TaxFactReviewStatus = "pending" | "approved" | "corrected" | "rejected";
export type TaxFactReviewAction = "approve" | "correct" | "reject";
export type TaxExportFormat = "json" | "csv";
export type TaxDocumentProcessingStatus =
  | "uploaded"
  | "classified"
  | "extracted"
  | "normalized"
  | "failed";

export interface TaxDocumentLatestExtraction {
  extractorName: string;
  extractorVersion: string;
  classification: string;
  confidenceScore: number | null;
  warnings: string[];
  createdAt: string | null;
}

export interface TaxDocument {
  id: number;
  taxYear: number;
  originalFileName: string;
  documentType: string;
  processingStatus: TaxDocumentProcessingStatus;
  sourceLabel: string;
  sourceHint: string;
  uploadedAt: string | null;
}

export interface TaxDocumentDetail extends TaxDocument {
  mimeType: string;
  byteSize: number;
  sha256: string;
  latestExtraction: TaxDocumentLatestExtraction | null;
}

export interface TaxDocumentsListResult {
  items: TaxDocument[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TaxDocumentDeleteResult {
  deletedDocumentId: number;
  deletedFactsCount: number;
}

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

export interface TaxExportDownloadResult {
  fileName: string;
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

interface TaxDocumentApiPayload {
  id?: unknown;
  taxYear?: unknown;
  originalFileName?: unknown;
  documentType?: unknown;
  processingStatus?: unknown;
  sourceLabel?: unknown;
  sourceHint?: unknown;
  uploadedAt?: unknown;
  mimeType?: unknown;
  byteSize?: unknown;
  sha256?: unknown;
  latestExtraction?: unknown;
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

const normalizeLatestExtraction = (value: unknown): TaxDocumentLatestExtraction | null => {
  const raw = normalizeObject(value);

  if (Object.keys(raw).length === 0) {
    return null;
  }

  return {
    extractorName: normalizeString(raw.extractorName),
    extractorVersion: normalizeString(raw.extractorVersion),
    classification: normalizeString(raw.classification),
    confidenceScore: normalizeNullableNumber(raw.confidenceScore),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.map((warning) => normalizeString(warning)).filter(Boolean)
      : [],
    createdAt: normalizeNullableString(raw.createdAt),
  };
};

const normalizeTaxDocument = (value: unknown): TaxDocument => {
  const raw = normalizeObject(value) as TaxDocumentApiPayload;
  const processingStatus = normalizeString(raw.processingStatus);

  return {
    id: normalizeNumber(raw.id),
    taxYear: normalizeNumber(raw.taxYear),
    originalFileName: normalizeString(raw.originalFileName),
    documentType: normalizeString(raw.documentType),
    processingStatus:
      processingStatus === "uploaded" ||
      processingStatus === "classified" ||
      processingStatus === "extracted" ||
      processingStatus === "normalized" ||
      processingStatus === "failed"
        ? processingStatus
        : "uploaded",
    sourceLabel: normalizeString(raw.sourceLabel),
    sourceHint: normalizeString(raw.sourceHint),
    uploadedAt: normalizeNullableString(raw.uploadedAt),
  };
};

const normalizeTaxDocumentDetail = (value: unknown): TaxDocumentDetail => {
  const raw = normalizeObject(value) as TaxDocumentApiPayload;

  return {
    ...normalizeTaxDocument(raw),
    mimeType: normalizeString(raw.mimeType),
    byteSize: normalizeNumber(raw.byteSize),
    sha256: normalizeString(raw.sha256),
    latestExtraction: normalizeLatestExtraction(raw.latestExtraction),
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

const DEFAULT_EXPORT_FILE_NAMES: Record<TaxExportFormat, string> = {
  json: "dossie-fiscal.json",
  csv: "dossie-fiscal.csv",
};

const resolveExportFileName = (
  contentDisposition: unknown,
  format: TaxExportFormat,
  taxYear: number,
): string => {
  const headerValue =
    typeof contentDisposition === "string"
      ? contentDisposition
      : Array.isArray(contentDisposition)
        ? normalizeString(contentDisposition[0])
        : "";
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim();
    } catch {
      return utf8Match[1].trim();
    }
  }

  const quotedMatch = headerValue.match(/filename="([^"]+)"/i);

  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const unquotedMatch = headerValue.match(/filename=([^;]+)/i);

  if (unquotedMatch?.[1]) {
    return unquotedMatch[1].trim();
  }

  const defaultFileName = DEFAULT_EXPORT_FILE_NAMES[format] || DEFAULT_EXPORT_FILE_NAMES.json;
  return defaultFileName.replace(".", `-${taxYear}.`);
};

const downloadBlobFile = (blob: Blob, fileName: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
};

const normalizeBlobApiError = async (error: unknown) => {
  if (!error || typeof error !== "object") {
    throw error;
  }

  const responseData = (error as { response?: { data?: unknown } }).response?.data;

  if (!(responseData instanceof Blob)) {
    throw error;
  }

  try {
    const rawText = await responseData.text();
    const parsedData = JSON.parse(rawText) as { message?: unknown; code?: unknown; requestId?: unknown };
    const normalizedError = error as { response?: { data?: unknown } };

    if (normalizedError.response) {
      normalizedError.response.data = {
        message: normalizeString(parsedData.message),
        code: normalizeString(parsedData.code),
        requestId: normalizeString(parsedData.requestId),
      };
    }
  } catch {
    // Preserve the original error when the blob is not a JSON error payload.
  }

  throw error;
};

export const taxService = {
  listDocuments: async (params: {
    taxYear: number;
    status?: TaxDocumentProcessingStatus;
    page?: number;
    pageSize?: number;
  }): Promise<TaxDocumentsListResult> => {
    const { data } = await api.get("/tax/documents", {
      params: {
        taxYear: params.taxYear,
        status: params.status,
        page: params.page,
        pageSize: params.pageSize,
      },
    });
    const raw = normalizeObject(data);

    return {
      items: Array.isArray(raw.items) ? raw.items.map(normalizeTaxDocument) : [],
      page: normalizeNumber(raw.page) || 1,
      pageSize: normalizeNumber(raw.pageSize) || 20,
      total: normalizeNumber(raw.total),
    };
  },

  uploadDocument: async (
    taxYear: number,
    file: File,
    options: {
      sourceLabel?: string;
      sourceHint?: string;
    } = {},
  ): Promise<TaxDocumentDetail> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("taxYear", String(taxYear));

    if (typeof options.sourceLabel === "string" && options.sourceLabel.trim()) {
      formData.append("sourceLabel", options.sourceLabel.trim());
    }

    if (typeof options.sourceHint === "string" && options.sourceHint.trim()) {
      formData.append("sourceHint", options.sourceHint.trim());
    }

    const { data } = await api.post("/tax/documents", formData);
    return normalizeTaxDocumentDetail(normalizeObject(data).document);
  },

  reprocessDocument: async (
    documentId: number,
    payload: Record<string, unknown> = {},
  ): Promise<TaxDocumentDetail> => {
    const { data } = await api.post(`/tax/documents/${documentId}/reprocess`, payload);
    return normalizeTaxDocumentDetail(normalizeObject(data).document);
  },

  deleteDocument: async (documentId: number): Promise<TaxDocumentDeleteResult> => {
    const { data } = await api.delete(`/tax/documents/${documentId}`);
    const raw = normalizeObject(data);

    return {
      deletedDocumentId: normalizeNumber(raw.deletedDocumentId),
      deletedFactsCount: normalizeNumber(raw.deletedFactsCount),
    };
  },

  downloadExport: async (
    taxYear: number,
    format: TaxExportFormat,
  ): Promise<TaxExportDownloadResult> => {
    let response;

    try {
      response = await api.get(`/tax/export/${taxYear}`, {
        params: { format },
        responseType: "blob",
      });
    } catch (error) {
      await normalizeBlobApiError(error);
      throw error;
    }

    const fileName = resolveExportFileName(
      response.headers?.["content-disposition"],
      format,
      taxYear,
    );
    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob([response.data as BlobPart], {
            type:
              typeof response.headers?.["content-type"] === "string"
                ? response.headers["content-type"]
                : format === "json"
                  ? "application/json;charset=utf-8"
                  : "text/csv;charset=utf-8",
          });

    downloadBlobFile(blob, fileName);

    return { fileName };
  },

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
