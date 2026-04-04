import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTaxDocumentStorageDescriptor,
  deleteStoredTaxDocument,
  readStoredTaxDocumentBuffer,
  resolveTaxDocumentAbsolutePath,
  resolveTaxDocumentStoragePolicy,
  saveTaxDocumentBuffer,
} from "./tax-document-storage.service.js";

const TEST_STORAGE_DIR = path.join(
  os.tmpdir(),
  "control-finance-tax-documents-storage-service-tests",
);

const ENV_KEYS = [
  "TAX_DOCUMENTS_STORAGE_DIR",
  "TAX_DOCUMENTS_STORAGE_ADAPTER",
];

const envSnapshot = {};

const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    if (typeof envSnapshot[key] === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = envSnapshot[key];
    }
  }
};

describe("tax-document-storage.service", () => {
  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      envSnapshot[key] = process.env[key];
    }

    process.env.TAX_DOCUMENTS_STORAGE_DIR = TEST_STORAGE_DIR;
    delete process.env.TAX_DOCUMENTS_STORAGE_ADAPTER;

    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    restoreEnv();
  });

  it("expoe politica de storage com adapter local por padrao", () => {
    const policy = resolveTaxDocumentStoragePolicy();

    expect(policy).toMatchObject({
      version: "aud-003-phase-a-v1",
      adapterName: "local",
    });
    expect(policy.supportedAdapters).toContain("local");
  });

  it("rejeita adapter nao suportado", () => {
    process.env.TAX_DOCUMENTS_STORAGE_ADAPTER = "blob";

    expect(() => resolveTaxDocumentStoragePolicy()).toThrow(
      "Unsupported TAX_DOCUMENTS_STORAGE_ADAPTER",
    );
  });

  it("mantem contrato de descriptor e saneia extensao insegura", () => {
    const descriptor = buildTaxDocumentStorageDescriptor({
      userId: 99,
      sha256: "a".repeat(64),
      originalFileName: "arquivo.exe;rm -rf",
    });

    expect(descriptor.storedFileName).toBe(`${"a".repeat(64)}.bin`);
    expect(descriptor.storageKey).toBe(`99/${"a".repeat(64)}.bin`);
  });

  it("salva, le e remove documento com adapter local", async () => {
    const payload = Buffer.from("fiscal-document-content", "utf8");

    const stored = await saveTaxDocumentBuffer({
      userId: 7,
      sha256: "b".repeat(64),
      originalFileName: "documento.pdf",
      buffer: payload,
    });

    expect(stored.storageKey).toBe(`7/${"b".repeat(64)}.pdf`);
    expect(stored.absolutePath).toBe(resolveTaxDocumentAbsolutePath(stored.storageKey));

    const loaded = await readStoredTaxDocumentBuffer(stored.storageKey);
    expect(Buffer.compare(loaded, payload)).toBe(0);

    await deleteStoredTaxDocument(stored.storageKey);

    await expect(readStoredTaxDocumentBuffer(stored.storageKey)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("bloqueia path traversal no storageKey", () => {
    expect(() => resolveTaxDocumentAbsolutePath("../escape.txt")).toThrow(
      "storageKey invalido",
    );
  });
});
