import { describe, expect, it } from "vitest";
import { runTaxExtractorForDocument } from "./tax-document-extractors.js";

describe("tax document extractors", () => {
  it("extrai campos basicos de informe bancario", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_bank",
      text: [
        "Banco Inter",
        "Informe de Rendimentos",
        "Ano-calendario 2025",
        "CNPJ 00.000.000/0001-91",
        "Saldo em 31/12/2024 R$ 1.200,00",
        "Saldo em 31/12/2025 R$ 2.450,20",
        "Rendimentos sujeitos a tributacao exclusiva R$ 13,49",
      ].join("\n"),
      classification: {
        sourceLabelSuggestion: "Banco Inter",
      },
    });

    expect(result.extractorName).toBe("income-report-bank");
    expect(result.payload.institutionName).toBe("Banco Inter");
    expect(result.payload.reportYear).toBe(2025);
    expect(result.payload.institutionDocument).toBe("00.000.000/0001-91");
    expect(result.payload.exclusiveTaxIncomeTotal).toBe(13.49);
    expect(result.payload.yearEndBalances).toHaveLength(2);
  });

  it("extrai campos basicos de comprovante do empregador", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_employer",
      text: [
        "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
        "Fonte pagadora ACME LTDA",
        "CNPJ 12.345.678/0001-90",
        "Beneficiario Joao da Silva",
        "CPF 123.456.789-00",
        "Rendimentos tributaveis R$ 54.321,00",
        "Imposto sobre a renda retido na fonte R$ 4.321,09",
        "Decimo terceiro R$ 5.000,00",
      ].join("\n"),
    });

    expect(result.extractorName).toBe("income-report-employer");
    expect(result.payload.payerDocument).toBe("12.345.678/0001-90");
    expect(result.payload.beneficiaryDocument).toBe("123.456.789-00");
    expect(result.payload.taxableIncome).toBe(54321);
    expect(result.payload.withheldTax).toBe(4321.09);
    expect(result.payload.thirteenthSalary).toBe(5000);
  });

  it("extrai sugestao estruturada do INSS", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_inss",
      text: [
        "INSS - INSTITUTO NACIONAL DO SEGURO SOCIAL",
        "Historico de Creditos",
        "01/2026 R$ 2.812,99 CCF - CONTA-CORRENTE Pago 05/02/2026",
        "101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67",
      ].join("\n"),
    });

    expect(result.extractorName).toBe("income-report-inss");
    expect(result.payload.profileSuggestion.referenceMonth).toBe("01/2026");
    expect(Array.isArray(result.payload.previewLines)).toBe(true);
  });
});
