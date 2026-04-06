const normalizeEnvValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeRawValue = (value) =>
  typeof value === "string" ? value.trim() : "";

const parseBooleanFlag = (value, defaultValue = false) => {
  const normalizedValue = normalizeEnvValue(value);

  if (!normalizedValue) {
    return defaultValue;
  }

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return defaultValue;
};

export const isProductionEnvironment = (env = process.env) =>
  normalizeEnvValue(env.NODE_ENV || "") === "production";

export const isLegacyLocalReadEnabled = (env = process.env) =>
  parseBooleanFlag(env.TAX_DOCUMENTS_LEGACY_LOCAL_READ_ENABLED, false);

export const resolveLegacyLocalStorageDir = (env = process.env) =>
  normalizeRawValue(env.TAX_DOCUMENTS_LEGACY_LOCAL_STORAGE_DIR || "");

const createRemoteStorageConfigError = (message) => {
  const error = new Error(message);
  error.code = "TAX_REMOTE_STORAGE_CONFIG_INVALID";
  return error;
};

export const resolveRemoteTaxDocumentsStorageConfig = (env = process.env) => {
  const bucket = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_BUCKET || "");
  const region = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_REGION || "");

  if (!bucket) {
    throw createRemoteStorageConfigError(
      "Invalid tax storage configuration: TAX_DOCUMENTS_REMOTE_BUCKET is required when TAX_DOCUMENTS_STORAGE_ADAPTER=s3.",
    );
  }

  if (!region) {
    throw createRemoteStorageConfigError(
      "Invalid tax storage configuration: TAX_DOCUMENTS_REMOTE_REGION is required when TAX_DOCUMENTS_STORAGE_ADAPTER=s3.",
    );
  }

  const endpoint = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_ENDPOINT || "");
  const accessKeyId = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_ACCESS_KEY_ID || "");
  const secretAccessKey = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_SECRET_ACCESS_KEY || "");
  const sessionToken = normalizeRawValue(env.TAX_DOCUMENTS_REMOTE_SESSION_TOKEN || "");

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw createRemoteStorageConfigError(
      "Invalid tax storage configuration: TAX_DOCUMENTS_REMOTE_ACCESS_KEY_ID and TAX_DOCUMENTS_REMOTE_SECRET_ACCESS_KEY must be provided together.",
    );
  }

  return {
    bucket,
    region,
    endpoint: endpoint || null,
    forcePathStyle: parseBooleanFlag(env.TAX_DOCUMENTS_REMOTE_FORCE_PATH_STYLE, false),
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          }
        : null,
  };
};
