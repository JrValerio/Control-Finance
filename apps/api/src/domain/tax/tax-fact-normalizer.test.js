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

  it("normaliza informe anual do INSS em fatos fiscais atomicos", () => {
    const facts = normalizeTaxExtractionToFacts({
      userId: 7,
      document: {
        id: 21,
        taxYear: 2026,
        documentType: "income_report_inss",
      },
      extraction: {
        id: 102,
        extractorName: "income-report-inss",
        classification: "income_report_inss",
        confidenceScore: 0.99,
        rawJson: {
          extraction: {
            reportProfile: "annual",
            reportYear: 2025,
            payerName: "Fundo do Regime Geral de Previdencia Social",
            payerDocument: "16.727.230/0001-97",
            beneficiaryName: "Maria Edleusa Monsao da Silva",
            beneficiaryDocument: "433.427.604-00",
            benefitNumber: "1776829899",
            incomeNatureCode: "3533",
            incomeNatureDescription: "Proventos de aposentadoria",
            taxableIncome: 34287.13,
            withheldTax: 13.36,
            retirement65PlusExempt: 22847.76,
            retirement65PlusThirteenthExempt: 1903.98,
            thirteenthSalary: 2868.57,
            thirteenthWithheldTax: 0,
          },
        },
      },
    });

    expect(facts).toHaveLength(5);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "taxable_income",
          subcategory: "inss_annual_taxable_income",
          payerDocument: "16727230000197",
          referencePeriod: "2025-annual",
          amount: 34287.13,
        }),
        expect.objectContaining({
          factType: "withheld_tax",
          subcategory: "inss_annual_withheld_tax",
          amount: 13.36,
        }),
        expect.objectContaining({
          factType: "exempt_income",
          subcategory: "inss_retirement_65_plus_exempt",
          amount: 22847.76,
        }),
        expect.objectContaining({
          factType: "exempt_income",
          subcategory: "inss_retirement_65_plus_thirteenth_exempt",
          amount: 1903.98,
        }),
        expect.objectContaining({
          factType: "exclusive_tax_income",
          subcategory: "inss_thirteenth_salary_exclusive",
          amount: 2868.57,
        }),
      ]),
    );
  });

  it("normaliza informe anual bancario em rendimentos, bens e dividas por item", () => {
    const facts = normalizeTaxExtractionToFacts({
      userId: 7,
      document: {
        id: 22,
        taxYear: 2026,
        documentType: "income_report_bank",
      },
      extraction: {
        id: 103,
        extractorName: "income-report-bank",
        classification: "income_report_bank",
        confidenceScore: 0.97,
        rawJson: {
          extraction: {
            reportProfile: "annual",
            reportYear: 2025,
            institutionName: "Itau Unibanco S.A.",
            institutionDocument: "60.701.190/0001-04",
            exclusiveIncomeItems: [
              {
                branchAccount: "3613/0042196-9",
                incomeTypeCode: "06",
                product: "RDB/CDB",
                grossIncome: 0.16,
                withheldTax: 0,
                declarableAmount: 0.16,
                institutionName: "Itau Unibanco S.A.",
                institutionDocument: "60.701.190/0001-04",
              },
            ],
            assetItems: [
              {
                branchAccount: "3613/0042196-9",
                groupCode: "06",
                itemCode: "01",
                product: "CONTA CORRENTE",
                balancePrevYear: 0,
                balanceCurrYear: 1,
                institutionName: "Itau Unibanco S.A.",
                institutionDocument: "60.701.190/0001-04",
              },
              {
                branchAccount: "3613/0042196-9",
                groupCode: "04",
                itemCode: "02",
                product: "RDB/CDB",
                balancePrevYear: 0,
                balanceCurrYear: 1052.16,
                institutionName: "Itau Unibanco S.A.",
                institutionDocument: "60.701.190/0001-04",
              },
            ],
            debtItems: [
              {
                branchAccount: "3613/0042196-9",
                productCode: "11",
                product: "CREDITO CONSIGNADO INTERNO INSS",
                contractNumber: "000002653219945",
                contractingDate: "19/02/2025",
                balancePrevYear: 0,
                balanceCurrYear: 3308.88,
                institutionName: "Itau Unibanco S.A.",
                institutionDocument: "60.701.190/0001-04",
              },
            ],
          },
        },
      },
    });

    expect(facts).toHaveLength(4);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "exclusive_tax_income",
          subcategory: "bank_annual_exclusive_income",
          referencePeriod: "2025-annual",
          amount: 0.16,
        }),
        expect.objectContaining({
          factType: "asset_balance",
          subcategory: "bank_account_balance",
          referencePeriod: "2025-12-31",
          amount: 1,
        }),
        expect.objectContaining({
          factType: "asset_balance",
          subcategory: "bank_investment_balance",
          referencePeriod: "2025-12-31",
          amount: 1052.16,
        }),
        expect.objectContaining({
          factType: "debt_balance",
          subcategory: "bank_debt_balance",
          referencePeriod: "2025-12-31",
          amount: 3308.88,
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
