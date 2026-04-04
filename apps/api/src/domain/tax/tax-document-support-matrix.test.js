import { describe, expect, it } from "vitest";
import {
  listTaxDocumentSupportMatrix,
  resolvePolicyBySourceType,
  resolveTaxDocumentSourceType,
} from "./tax-document-support-matrix.js";

describe("tax document support matrix", () => {
  it("mantem sourceType e politica coerentes para cada documentType", () => {
    const matrix = listTaxDocumentSupportMatrix();

    expect(matrix.length).toBeGreaterThan(0);

    matrix.forEach((item) => {
      const expectedSourceType = resolveTaxDocumentSourceType(item.documentType);
      const expectedPolicy = resolvePolicyBySourceType(expectedSourceType);

      expect(item.sourceType).toBe(expectedSourceType);
      expect(item.supportLevel).toBe(expectedPolicy.supportLevel);
      expect(item.supportsExtraction).toBe(expectedPolicy.supportsExtraction);
      expect(item.allowsSuggestion).toBe(expectedPolicy.allowsSuggestion);
      expect(item.allowsExecution).toBe(expectedPolicy.allowsExecution);
    });
  });
});
