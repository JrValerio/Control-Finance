import {
  TAX_DEFAULT_PAGE_SIZE,
  TAX_DOCUMENT_PROCESSING_STATUSES,
  TAX_FACT_SOURCE_FILTERS,
  TAX_FACT_REVIEW_STATUSES,
  TAX_FACT_TYPES,
  TAX_MAX_PAGE_SIZE,
} from "./tax.constants.js";

export const createTaxError = (status, message, publicCode = "") => {
  const error = new Error(message);
  error.status = status;

  if (typeof publicCode === "string" && publicCode.trim()) {
    error.publicCode = publicCode.trim();
  }

  return error;
};

export const normalizeTaxUserId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createTaxError(401, "Usuario nao autenticado.");
  }

  return parsedValue;
};

export const normalizeTaxYear = (value, fieldName = "taxYear") => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 2000 || parsedValue > 2100) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  return parsedValue;
};

export const normalizePagination = (query = {}) => {
  const parsedPage = Number(query.page);
  const parsedPageSize = Number(query.pageSize ?? query.limit);

  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const requestedPageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? parsedPageSize
      : TAX_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(requestedPageSize, TAX_MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
};

export const normalizeOptionalDocumentProcessingStatus = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  const normalizedValue = String(value).trim();

  if (!TAX_DOCUMENT_PROCESSING_STATUSES.includes(normalizedValue)) {
    throw createTaxError(400, "status invalido.");
  }

  return normalizedValue;
};

export const normalizeOptionalTaxFactReviewStatus = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  const normalizedValue = String(value).trim();

  if (!TAX_FACT_REVIEW_STATUSES.includes(normalizedValue)) {
    throw createTaxError(400, "reviewStatus invalido.");
  }

  return normalizedValue;
};

export const normalizeOptionalTaxFactSourceFilter = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  const normalizedValue = String(value).trim();

  if (!TAX_FACT_SOURCE_FILTERS.includes(normalizedValue)) {
    throw createTaxError(400, "sourceFilter invalido.");
  }

  return normalizedValue;
};

export const normalizeTaxFactId = (value, fieldName = "factId") => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  return parsedValue;
};

export const normalizeTaxFactType = (value, fieldName = "factType") => {
  const normalizedValue = String(value || "").trim();

  if (!TAX_FACT_TYPES.includes(normalizedValue)) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  return normalizedValue;
};

export const normalizeTaxReviewAction = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!["approve", "correct", "reject"].includes(normalizedValue)) {
    throw createTaxError(400, "action invalida.");
  }

  return normalizedValue;
};

export const normalizeBulkTaxReviewAction = (value) => {
  const normalizedValue = String(value || "").trim();

  if (normalizedValue !== "approve") {
    throw createTaxError(400, "action invalida.");
  }

  return normalizedValue;
};

export const toISOStringOrNull = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(value).toISOString();
};
