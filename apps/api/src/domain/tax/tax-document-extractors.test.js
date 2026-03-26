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
        "Saldo em 31/12/2024 R$ 1.200,00",
        "Saldo em 31/12/2025 R$ 2.450,20",
        "Rendimentos sujeitos a tributacao exclusiva",
      ].join("\n"),
      classification: {
        sourceLabelSuggestion: "Banco Inter",
      },
    });

    expect(result.extractorName).toBe("income-report-bank");
    expect(result.payload.institutionName).toBe("Banco Inter");
    expect(result.payload.reportYear).toBe(2025);
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
        "Rendimentos tributaveis",
      ].join("\n"),
    });

    expect(result.extractorName).toBe("income-report-employer");
    expect(result.payload.payerDocument).toBe("12.345.678/0001-90");
    expect(result.payload.beneficiaryDocument).toBe("123.456.789-00");
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
