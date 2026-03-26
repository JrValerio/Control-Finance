import { describe, expect, it } from "vitest";
import {
  generateTaxFactDedupeKey,
  normalizeTaxExtractionToFacts,
} from "./tax-fact-normalizer.js";

describe("tax fact normalizer", () => {
  it("normaliza informe do empregador em fatos fiscais padronizados", () => {
    const facts = normalizeTaxExtractionToFacts({
      userId: 7,
      document: {
        id: 11,
        taxYear: 2026,
        documentType: "income_report_employer",
      },
      extraction: {
        id: 99,
        extractorName: "income-report-employer",
        classification: "income_report_employer",
        confidenceScore: 0.98,
        rawJson: {
          extraction: {
            reportYear: 2025,
            payerName: "ACME LTDA",
            payerDocument: "12.345.678/0001-90",
            beneficiaryName: "Joao da Silva",
            beneficiaryDocument: "123.456.789-00",
            taxableIncome: 54321,
            withheldTax: 4321.09,
            thirteenthSalary: 5000,
          },
        },
      },
    });

    expect(facts).toHaveLength(3);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "taxable_income",
          category: "income_report_employer",
          subcategory: "annual_taxable_income",
          payerDocument: "12345678000190",
          referencePeriod: "2025",
          amount: 54321,
          reviewStatus: "pending",
        }),
        expect.objectContaining({
          factType: "withheld_tax",
          subcategory: "annual_withheld_tax",
          amount: 4321.09,
        }),
        expect.objectContaining({
          factType: "exclusive_tax_income",
          subcategory: "thirteenth_salary",
          amount: 5000,
        }),
      ]),
    );
    expect(facts[0].dedupeKey).toHaveLength(64);
  });

  it("normaliza informe bancario em rendimentos e saldos de fim de ano", () => {
    const facts = normalizeTaxExtractionToFacts({
      userId: 7,
      document: {
        id: 18,
        taxYear: 2026,
        documentType: "income_report_bank",
      },
      extraction: {
        id: 101,
        extractorName: "income-report-bank",
        classification: "income_report_bank",
        confidenceScore: 0.94,
        rawJson: {
          extraction: {
            reportYear: 2025,
            institutionName: "Banco Inter",
            institutionDocument: "00.000.000/0001-91",
            exclusiveTaxIncomeTotal: 13.49,
            yearEndBalances: [
              { date: "31/12/2024", amount: 1200 },
              { date: "31/12/2025", amount: 2450.2 },
            ],
          },
        },
      },
    });

    expect(facts).toHaveLength(3);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "exclusive_tax_income",
          referencePeriod: "2025",
          amount: 13.49,
        }),
        expect.objectContaining({
          factType: "asset_balance",
          referencePeriod: "2024-12-31",
          amount: 1200,
        }),
        expect.objectContaining({
          factType: "asset_balance",
          referencePeriod: "2025-12-31",
          amount: 2450.2,
        }),
      ]),
    );
  });

  it("gera dedupe key estavel para a mesma chave logica", () => {
    const keyA = generateTaxFactDedupeKey({
      userId: 7,
      taxYear: 2026,
      factType: "taxable_income",
      payerDocument: "12.345.678/0001-90",
      referencePeriod: "2025",
      amount: 54321,
    });
    const keyB = generateTaxFactDedupeKey({
      userId: 7,
      taxYear: 2026,
      factType: "taxable_income",
      payerDocument: "12345678000190",
      referencePeriod: "2025",
      amount: 54321.0,
    });

    expect(keyA).toHaveLength(64);
    expect(keyA).toBe(keyB);
  });
});
