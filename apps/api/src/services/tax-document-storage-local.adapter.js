import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeTaxDocumentStorageSegments } from "./tax-document-storage.policy.js";

const DEFAULT_STORAGE_DIR = path.join(os.tmpdir(), "control-finance", "tax-documents");

export const resolveLocalTaxDocumentsStorageDir = (env = process.env) => {
  const configuredDirectory = String(env.TAX_DOCUMENTS_STORAGE_DIR || "").trim();

  if (!configuredDirectory) {
    return DEFAULT_STORAGE_DIR;
  }

  return path.resolve(configuredDirectory);
};

export const createLocalTaxDocumentStorageAdapter = (env = process.env) => {
  const resolveAbsolutePath = (storageKey) => {
    const storageRoot = resolveLocalTaxDocumentsStorageDir(env);
    const segments = normalizeTaxDocumentStorageSegments(storageKey);

    return path.join(storageRoot, ...segments);
  };

  return {
    name: "local",
    resolveAbsolutePath,
    async saveDocument({ storageKey, buffer }) {
      const absolutePath = resolveAbsolutePath(storageKey);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, buffer);
      return { absolutePath };
    },
    async readDocument({ storageKey }) {
      return fs.readFile(resolveAbsolutePath(storageKey));
    },
    async deleteDocument({ storageKey }) {
      const absolutePath = resolveAbsolutePath(storageKey);

      try {
        await fs.unlink(absolutePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
};
