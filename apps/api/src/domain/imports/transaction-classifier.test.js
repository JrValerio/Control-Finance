import { describe, expect, it } from "vitest";
import {
  applySmartClassification,
  createClassificationIndex,
  suggestCategoryNameForImportedRow,
} from "./transaction-classifier.js";

describe("transaction classifier", () => {
  const categories = [
    { id: 1, name: "Transporte" },
    { id: 2, name: "Alimentacao" },
    { id: 3, name: "Saude" },
    { id: 4, name: "Beneficios" },
  ];

  it("sugere categoria existente para saida de mobilidade", () => {
    const category = suggestCategoryNameForImportedRow(
      {
        type: "Saida",
        description: "PIX QRS UBER DO BRA",
        notes: "",
        category: "",
      },
      categories,
    );

    expect(category).toBe("Transporte");
  });

  it("sugere categoria existente para entrada de beneficio", () => {
    const category = suggestCategoryNameForImportedRow(
      {
        type: "Entrada",
        description: "PGTO INSS 01776829899",
        notes: "Credito mensal",
        category: "",
      },
      categories,
    );

    expect(category).toBe("Beneficios");
  });

  it("preserva categoria informada manualmente", () => {
    const category = suggestCategoryNameForImportedRow(
      {
        type: "Saida",
        description: "MERCADO CENTRAL",
        notes: "",
        category: "Alimentacao",
      },
      categories,
    );

    expect(category).toBe("Alimentacao");
  });

  it("pre-computa indice uma vez e reutiliza nas sugestoes", () => {
    const classificationIndex = createClassificationIndex(categories);

    const category = suggestCategoryNameForImportedRow(
      {
        type: "Entrada",
        description: "PGTO INSS 01776829899",
        notes: "Credito mensal",
        category: "",
      },
      classificationIndex,
    );

    expect(category).toBe("Beneficios");
    expect(classificationIndex.keywordMapsByType.get("Entrada")).toBeInstanceOf(Map);
  });

  it("aplica sugestao no shape das linhas importadas", () => {
    const rows = applySmartClassification(
      [
        {
          line: 1,
          raw: {
            date: "2026-02-05",
            type: "Saida",
            value: "15.98",
            description: "PIX QRS UBER DO BRA",
            notes: "",
            category: "",
          },
        },
      ],
      categories,
    );

    expect(rows[0].raw.category).toBe("Transporte");
  });
});
