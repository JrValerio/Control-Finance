import path from "node:path";
import { trackDomainFlowError, trackDomainFlowSuccess } from "../observability/domain-metrics.js";
import {
  TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL,
  TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3,
  TAX_DOCUMENT_STORAGE_POLICY_VERSION,
  TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS,
  resolveTaxDocumentStorageAdapterName,
  sanitizeTaxDocumentFileExtension,
} from "./tax-document-storage.policy.js";
import {
  createLocalTaxDocumentStorageAdapter,
  resolveLocalTaxDocumentsStorageDir,
} from "./tax-document-storage-local.adapter.js";
import { createS3TaxDocumentStorageAdapter } from "./tax-document-storage-s3.adapter.js";
import {
  isLegacyLocalReadEnabled,
  resolveLegacyLocalStorageDir,
  resolveRemoteTaxDocumentsStorageConfig,
} from "./tax-document-storage-remote.config.js";

const STORAGE_FLOW = "tax_documents_storage";

const REMOTE_STORAGE_NOT_FOUND_CODES = new Set([
  "NoSuchKey",
  "NotFound",
  "ENOENT",
]);

const assertStorageAdapterContract = (adapter, adapterName) => {
  const requiredMethods = [
    "resolveAbsolutePath",
    "saveDocument",
    "readDocument",
    "deleteDocument",
  ];

  for (const methodName of requiredMethods) {
    if (typeof adapter?.[methodName] !== "function") {
      throw new Error(
        `Invalid tax storage adapter '${adapterName}': missing method '${methodName}'.`,
      );
    }
  }

  return adapter;
};

const createStorageAdapter = (adapterName, env = process.env) => {
  if (adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL) {
    return createLocalTaxDocumentStorageAdapter(env);
  }

  if (adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3) {
    return createS3TaxDocumentStorageAdapter(env);
  }

  throw new Error(
    `Unsupported TAX_DOCUMENTS_STORAGE_ADAPTER '${adapterName}'. Supported values: ${[
      ...TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS,
    ].join(", ")}.`,
  );
};

const resolveTaxDocumentStorageAdapter = (env = process.env) => {
  const adapterName = resolveTaxDocumentStorageAdapterName(env);
  const adapter = assertStorageAdapterContract(createStorageAdapter(adapterName, env), adapterName);

  return {
    adapterName,
    adapter,
  };
};

export const resolveTaxDocumentStoragePolicy = (env = process.env) => ({
  version: TAX_DOCUMENT_STORAGE_POLICY_VERSION,
  adapterName: resolveTaxDocumentStorageAdapterName(env),
  supportedAdapters: [...TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS],
});

export const resolveTaxDocumentsStorageDir = (env = process.env) => {
  const adapterName = resolveTaxDocumentStorageAdapterName(env);

  if (adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL) {
    return resolveLocalTaxDocumentsStorageDir(env);
  }

  if (adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3) {
    const config = resolveRemoteTaxDocumentsStorageConfig(env);
    return `s3://${config.bucket}`;
  }

  return path.resolve(resolveLocalTaxDocumentsStorageDir(env));
};

const isRemoteStorageNotFoundError = (error) => {
  const code = String(error?.code || error?.name || "").trim();
  return REMOTE_STORAGE_NOT_FOUND_CODES.has(code);
};

const resolveLegacyLocalAdapter = (env = process.env) => {
  const legacyStorageDir = resolveLegacyLocalStorageDir(env);

  return createLocalTaxDocumentStorageAdapter({
    ...env,
    ...(legacyStorageDir ? { TAX_DOCUMENTS_STORAGE_DIR: legacyStorageDir } : {}),
  });
};

export const buildTaxDocumentStorageDescriptor = ({
  userId,
  sha256,
  originalFileName,
}) => {
  const storedFileName = `${sha256}${sanitizeTaxDocumentFileExtension(originalFileName)}`;
  const storageKey = path.posix.join(String(userId), storedFileName);

  return {
    storedFileName,
    storageKey,
  };
};

export const resolveTaxDocumentAbsolutePath = (storageKey) => {
  const { adapter } = resolveTaxDocumentStorageAdapter();
  return adapter.resolveAbsolutePath(storageKey);
};

export const saveTaxDocumentBuffer = async ({
  userId,
  sha256,
  originalFileName,
  buffer,
}) => {
  const { adapter } = resolveTaxDocumentStorageAdapter();
  const descriptor = buildTaxDocumentStorageDescriptor({
    userId,
    sha256,
    originalFileName,
  });

  try {
    const persisted = await adapter.saveDocument({
      storageKey: descriptor.storageKey,
      buffer,
    });

    trackDomainFlowSuccess({ flow: STORAGE_FLOW, operation: "save" });

    return {
      ...descriptor,
      absolutePath:
        typeof persisted?.absolutePath === "string"
          ? persisted.absolutePath
          : adapter.resolveAbsolutePath(descriptor.storageKey),
    };
  } catch (error) {
    trackDomainFlowError({ flow: STORAGE_FLOW, operation: "save" });
    throw error;
  }
};

export const readStoredTaxDocumentBuffer = async (storageKey) => {
  const { adapterName, adapter } = resolveTaxDocumentStorageAdapter();

  try {
    const buffer = await adapter.readDocument({ storageKey });
    trackDomainFlowSuccess({ flow: STORAGE_FLOW, operation: "read" });
    return buffer;
  } catch (error) {
    if (
      adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3 &&
      isLegacyLocalReadEnabled() &&
      isRemoteStorageNotFoundError(error)
    ) {
      const legacyLocalAdapter = resolveLegacyLocalAdapter();

      try {
        const buffer = await legacyLocalAdapter.readDocument({ storageKey });
        trackDomainFlowSuccess({
          flow: STORAGE_FLOW,
          operation: "read_legacy_local_fallback",
        });
        return buffer;
      } catch (legacyError) {
        trackDomainFlowError({
          flow: STORAGE_FLOW,
          operation: "read_legacy_local_fallback",
        });
        throw legacyError;
      }
    }

    trackDomainFlowError({ flow: STORAGE_FLOW, operation: "read" });
    throw error;
  }
};

export const deleteStoredTaxDocument = async (storageKey) => {
  const { adapterName, adapter } = resolveTaxDocumentStorageAdapter();

  try {
    await adapter.deleteDocument({ storageKey });

    if (
      adapterName === TAX_DOCUMENT_STORAGE_ADAPTER_REMOTE_S3 &&
      isLegacyLocalReadEnabled()
    ) {
      const legacyLocalAdapter = resolveLegacyLocalAdapter();
      await legacyLocalAdapter.deleteDocument({ storageKey });
    }

    trackDomainFlowSuccess({ flow: STORAGE_FLOW, operation: "delete" });
  } catch (error) {
    trackDomainFlowError({ flow: STORAGE_FLOW, operation: "delete" });
    throw error;
  }
};
