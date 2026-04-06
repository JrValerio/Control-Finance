import {
  TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3,
  resolveTaxDocumentStorageAdapterName,
} from "../services/tax-document-storage.policy.js";
import {
  isLegacyLocalReadEnabled,
  isProductionEnvironment,
  resolveLegacyLocalStorageDir,
  resolveRemoteTaxDocumentsStorageConfig,
} from "../services/tax-document-storage-remote.config.js";

const createTaxStorageEnvError = (message, code = "TAX_STORAGE_ENV_INVALID") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const assertTaxStorageEnvironmentConsistency = (env = process.env) => {
  if (!isProductionEnvironment(env)) {
    return;
  }

  const adapterName = resolveTaxDocumentStorageAdapterName(env);

  if (adapterName !== TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3) {
    throw createTaxStorageEnvError(
      "Invalid tax storage environment: NODE_ENV=production requires TAX_DOCUMENTS_STORAGE_ADAPTER=s3.",
      "TAX_STORAGE_ADAPTER_REQUIRED",
    );
  }

  resolveRemoteTaxDocumentsStorageConfig(env);

  if (isLegacyLocalReadEnabled(env) && !resolveLegacyLocalStorageDir(env)) {
    throw createTaxStorageEnvError(
      "Invalid tax storage environment: TAX_DOCUMENTS_LEGACY_LOCAL_STORAGE_DIR is required when TAX_DOCUMENTS_LEGACY_LOCAL_READ_ENABLED=true in production.",
      "TAX_STORAGE_LEGACY_LOCAL_DIR_REQUIRED",
    );
  }
};
