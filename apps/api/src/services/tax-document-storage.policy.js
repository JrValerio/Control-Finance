const sanitizeEnvValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const STORAGE_KEY_SEGMENT_REGEX = /^[a-zA-Z0-9._-]{1,120}$/;
const MAX_STORAGE_KEY_SEGMENTS = 8;
const MAX_STORAGE_KEY_LENGTH = 512;

export const TAX_DOCUMENT_STORAGE_POLICY_VERSION = "aud-003-phase-a-v1";
export const TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL = "local";
export const TAX_DOCUMENT_STORAGE_DEFAULT_ADAPTER = TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL;
export const TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS = new Set([
  TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL,
]);

export const sanitizeTaxDocumentFileExtension = (originalFileName) => {
  const extension = (String(originalFileName || "").match(/\.[^./\\]+$/)?.[0] || "").toLowerCase();

  if (!extension) {
    return ".bin";
  }

  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
};

export const normalizeTaxDocumentStorageSegments = (storageKey) => {
  const normalizedKey = String(storageKey || "").replaceAll("\\", "/");

  if (!normalizedKey || normalizedKey.length > MAX_STORAGE_KEY_LENGTH) {
    throw new Error("storageKey invalido.");
  }

  const segments = normalizedKey.split("/").filter(Boolean);

  if (segments.length === 0 || segments.length > MAX_STORAGE_KEY_SEGMENTS) {
    throw new Error("storageKey invalido.");
  }

  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !STORAGE_KEY_SEGMENT_REGEX.test(segment),
    )
  ) {
    throw new Error("storageKey invalido.");
  }

  return segments;
};

export const resolveTaxDocumentStorageAdapterName = (env = process.env) => {
  const rawAdapterName = sanitizeEnvValue(
    env.TAX_DOCUMENTS_STORAGE_ADAPTER || TAX_DOCUMENT_STORAGE_DEFAULT_ADAPTER,
  );

  const adapterName = rawAdapterName || TAX_DOCUMENT_STORAGE_DEFAULT_ADAPTER;

  if (!TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS.has(adapterName)) {
    const supportedValues = [...TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS].join(", ");
    throw new Error(
      `Unsupported TAX_DOCUMENTS_STORAGE_ADAPTER '${adapterName}'. Supported values: ${supportedValues}.`,
    );
  }

  return adapterName;
};
