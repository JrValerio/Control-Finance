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

  it("extrai payload anual do INSS para IRPF", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_inss",
      text: [
        "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
        "Imposto sobre a Renda Retido na Fonte",
        "Exercicio de 2026 Ano-calendario de 2025",
        "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
        "433.427.604-00 MARIA EDLEUSA MONSAO DA SILVA 1776829899",
        "3533-PROVENTOS DE APOSENT., RESERVA, REFORMA OU PENSAO PAGOS PELA PREV. SOCIAL",
        "1. Total dos rendimentos (inclusive ferias) 34.287,13",
        "5. Imposto sobre a renda retido na fonte 13,36",
        "1. Parcela isenta dos proventos de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais), exceto a 22.847,76",
        "2. Parcela isenta do 13o salario de aposentadoria, reserva remunerada, reforma e pensao (65 anos ou mais). 1.903,98",
        "1. Decimo terceiro salario 2.868,57",
        "2. Imposto sobre a renda retido na fonte sobre 13o salario 0,00",
      ].join("\n"),
    });

    expect(result.extractorName).toBe("income-report-inss");
    expect(result.payload.reportProfile).toBe("annual");
    expect(result.payload.reportYear).toBe(2025);
    expect(result.payload.payerDocument).toBe("16.727.230/0001-97");
    expect(result.payload.beneficiaryDocument).toBe("433.427.604-00");
    expect(result.payload.benefitNumber).toBe("1776829899");
    expect(result.payload.taxableIncome).toBe(34287.13);
    expect(result.payload.withheldTax).toBe(13.36);
    expect(result.payload.retirement65PlusExempt).toBe(22847.76);
    expect(result.payload.retirement65PlusThirteenthExempt).toBe(1903.98);
    expect(result.payload.thirteenthSalary).toBe(2868.57);
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

  it("extrai informe anual bancario itemizado no layout do Itau", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_bank",
      text: [
        "Informe de Rendimentos",
        "Ano Calendario 2025",
        "Cliente: Maria Edileusa Moncao da Silva CPF: 433.427.604-00",
        "Ficha da Declaracao: Rendimentos Sujeitos a Tributacao Exclusiva/Definitiva",
        "Fonte Pagadora: Itau Unibanco S.A. CNPJ: 60.701.190/0001-04",
        "3613/0042196-9 06 RDB/CDB 0,16 0,00 0,16",
        "Total: 0,16 0,00 0,16",
        "Ficha da Declaracao: Bens e Direitos",
        "3613/0042196-9 06 01 CONTA CORRENTE 0,00 1,00",
        "3613/0042196-9 04 02 RDB/CDB 0,00 1.052,16",
        "Total: 0,00 1.053,16",
        "Ficha da Declaracao: Dividas e Onus Reais",
        "Credor: Itau Unibanco S.A. CNPJ: 60.701.190/0001-04",
        "3613/0042196-9 11 CREDITO CONSIGNADO",
        "INTERNO INSS 000002653219945 19/02/2025 0,00 3.308,88",
        "Total: 0,00 3.308,88",
      ].join("\n"),
      classification: {
        sourceLabelSuggestion: "Itau",
      },
    });

    expect(result.extractorName).toBe("income-report-bank");
    expect(result.payload.reportProfile).toBe("annual");
    expect(result.payload.reportYear).toBe(2025);
    expect(result.payload.institutionDocument).toBe("60.701.190/0001-04");
    expect(result.payload.customerDocument).toBe("433.427.604-00");
    expect(result.payload.exclusiveIncomeItems).toEqual([
      expect.objectContaining({
        branchAccount: "3613/0042196-9",
        incomeTypeCode: "06",
        product: "RDB/CDB",
        declarableAmount: 0.16,
      }),
    ]);
    expect(result.payload.assetItems).toEqual([
      expect.objectContaining({
        groupCode: "06",
        itemCode: "01",
        balanceCurrYear: 1,
      }),
      expect.objectContaining({
        groupCode: "04",
        itemCode: "02",
        balanceCurrYear: 1052.16,
      }),
    ]);
    expect(result.payload.debtItems).toEqual([
      expect.objectContaining({
        productCode: "11",
        contractNumber: "000002653219945",
        balanceCurrYear: 3308.88,
      }),
    ]);
  });

  it("extrai informe anual bancario label-based no layout do PicPay", () => {
    const result = runTaxExtractorForDocument({
      documentType: "income_report_bank",
      text: [
        "Pessoa fisica beneficiaria",
        "Nome completo:",
        "Amaro Valerio Da Silva Junior",
        "CPF:",
        "214.679.738-07",
        "2025",
        "Ano Calendario",
        "Nome",
        "PicPay Bank Banco Multiplo S.A.",
        "CNPJ",
        "09.516.419/0001-75",
        "Fonte pagadora 2/2:",
        "Bens e Direitos",
        "Informacoes para Declaracao",
        "Codigo: 02 - Titulos publicos e privados sujeitos a tributacao",
        "Grupo de bens: 04 - Aplicacoes e investimentos",
        "Saldo em 31/12/2024 Saldo em 31/12/2025",
        "R$ 371,40 R$ 346,96 Conta e Cofrinhos",
        "Rendimentos Sujeitos a Tributacao Exclusiva",
        "Informacoes para declaracao",
        "Codigo: 06 - Rendimentos de aplicacoes financeiras",
        "Valor",
        "R$ 13,49 Conta e cofrinhos",
      ].join("\n"),
      classification: {
        sourceLabelSuggestion: "PicPay",
      },
    });

    expect(result.extractorName).toBe("income-report-bank");
    expect(result.payload.reportProfile).toBe("annual");
    expect(result.payload.reportYear).toBe(2025);
    expect(result.payload.customerDocument).toBe("214.679.738-07");
    expect(result.payload.exclusiveIncomeItems).toEqual([
      expect.objectContaining({
        institutionDocument: "09.516.419/0001-75",
        product: "Conta e cofrinhos",
        declarableAmount: 13.49,
      }),
    ]);
    expect(result.payload.assetItems).toEqual([
      expect.objectContaining({
        institutionDocument: "09.516.419/0001-75",
        groupCode: "04",
        itemCode: "02",
        balancePrevYear: 371.4,
        balanceCurrYear: 346.96,
      }),
    ]);
  });
});
