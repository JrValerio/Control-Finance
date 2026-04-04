import path from "node:path";
import { trackDomainFlowError, trackDomainFlowSuccess } from "../observability/domain-metrics.js";
import {
  TAX_DOCUMENT_STORAGE_ADAPTER_LOCAL,
  TAX_DOCUMENT_STORAGE_POLICY_VERSION,
  TAX_DOCUMENT_STORAGE_SUPPORTED_ADAPTERS,
  resolveTaxDocumentStorageAdapterName,
  sanitizeTaxDocumentFileExtension,
} from "./tax-document-storage.policy.js";
import {
  createLocalTaxDocumentStorageAdapter,
  resolveLocalTaxDocumentsStorageDir,
} from "./tax-document-storage-local.adapter.js";

const STORAGE_FLOW = "tax_documents_storage";

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

  return path.resolve(resolveLocalTaxDocumentsStorageDir(env));
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
  const { adapter } = resolveTaxDocumentStorageAdapter();

  try {
    const buffer = await adapter.readDocument({ storageKey });
    trackDomainFlowSuccess({ flow: STORAGE_FLOW, operation: "read" });
    return buffer;
  } catch (error) {
    trackDomainFlowError({ flow: STORAGE_FLOW, operation: "read" });
    throw error;
  }
};

export const deleteStoredTaxDocument = async (storageKey) => {
  const { adapter } = resolveTaxDocumentStorageAdapter();

  try {
    await adapter.deleteDocument({ storageKey });
    trackDomainFlowSuccess({ flow: STORAGE_FLOW, operation: "delete" });
  } catch (error) {
    trackDomainFlowError({ flow: STORAGE_FLOW, operation: "delete" });
    throw error;
  }
};
