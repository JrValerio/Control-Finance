import { describe, expect, it } from "vitest";
import {
  assertTaxStorageEnvironmentConsistency,
  resolveTaxStorageModuleAvailability,
} from "./tax-storage-env-guard.js";

const baseEnv = {
  NODE_ENV: "test",
  TAX_DOCUMENTS_STORAGE_ADAPTER: "local",
};

describe("tax-storage-env-guard", () => {
  it("nao aplica hard fail fora de producao", () => {
    expect(() => assertTaxStorageEnvironmentConsistency(baseEnv)).not.toThrow();
  });

  it("falha em producao quando adapter nao e s3", () => {
    expect(() =>
      assertTaxStorageEnvironmentConsistency({
        ...baseEnv,
        NODE_ENV: "production",
        TAX_DOCUMENTS_STORAGE_ADAPTER: "local",
      }),
    ).toThrow("NODE_ENV=production requires TAX_DOCUMENTS_STORAGE_ADAPTER=s3");
  });

  it("falha em producao quando bucket remoto nao esta configurado", () => {
    expect(() =>
      assertTaxStorageEnvironmentConsistency({
        ...baseEnv,
        NODE_ENV: "production",
        TAX_DOCUMENTS_STORAGE_ADAPTER: "s3",
        TAX_DOCUMENTS_REMOTE_REGION: "us-east-1",
      }),
    ).toThrow("TAX_DOCUMENTS_REMOTE_BUCKET is required");
  });

  it("falha em producao quando leitura de legado e habilitada sem diretorio dedicado", () => {
    expect(() =>
      assertTaxStorageEnvironmentConsistency({
        ...baseEnv,
        NODE_ENV: "production",
        TAX_DOCUMENTS_STORAGE_ADAPTER: "s3",
        TAX_DOCUMENTS_REMOTE_BUCKET: "control-finance-tax",
        TAX_DOCUMENTS_REMOTE_REGION: "us-east-1",
        TAX_DOCUMENTS_LEGACY_LOCAL_READ_ENABLED: "true",
      }),
    ).toThrow("TAX_DOCUMENTS_LEGACY_LOCAL_STORAGE_DIR is required");
  });

  it("aceita configuracao remota valida em producao", () => {
    expect(() =>
      assertTaxStorageEnvironmentConsistency({
        ...baseEnv,
        NODE_ENV: "production",
        TAX_DOCUMENTS_STORAGE_ADAPTER: "s3",
        TAX_DOCUMENTS_REMOTE_BUCKET: "control-finance-tax",
        TAX_DOCUMENTS_REMOTE_REGION: "us-east-1",
      }),
    ).not.toThrow();
  });

  it("resolve availability desabilita modulo fiscal em producao quando adapter nao e s3", () => {
    expect(
      resolveTaxStorageModuleAvailability({
        ...baseEnv,
        NODE_ENV: "production",
        TAX_DOCUMENTS_STORAGE_ADAPTER: "local",
      }),
    ).toEqual({
      enabled: false,
      code: "TAX_STORAGE_ADAPTER_REQUIRED",
      reason:
        "Invalid tax storage environment: NODE_ENV=production requires TAX_DOCUMENTS_STORAGE_ADAPTER=s3.",
    });
  });

  it("resolve availability mantem modulo habilitado fora de producao", () => {
    expect(resolveTaxStorageModuleAvailability(baseEnv)).toEqual({
      enabled: true,
      code: null,
      reason: null,
    });
  });
});
