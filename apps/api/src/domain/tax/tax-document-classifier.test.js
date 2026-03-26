import { describe, expect, it } from "vitest";
import { classifyTaxDocument } from "./tax-document-classifier.js";

describe("tax document classifier", () => {
  it("detecta informe bancario com sinais fiscais", () => {
    const result = classifyTaxDocument({
      originalFileName: "informe-inter-2025.csv",
      text: [
        "Banco Inter",
        "Informe de Rendimentos",
        "Ano-calendario 2025",
        "Rendimentos sujeitos a tributacao exclusiva",
        "Saldo em 31/12/2025 R$ 2.450,20",
      ].join("\n"),
    });

    expect(result.documentType).toBe("income_report_bank");
    expect(result.sourceLabelSuggestion).toBe("Banco Inter");
  });

  it("detecta comprovante de rendimentos do empregador", () => {
    const result = classifyTaxDocument({
      originalFileName: "empresa.csv",
      text: [
        "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte",
        "Fonte pagadora ACME LTDA",
        "Rendimentos tributaveis",
        "Contribuicao previdenciaria oficial",
      ].join("\n"),
    });

    expect(result.documentType).toBe("income_report_employer");
  });

  it("detecta INSS por sinais do texto", () => {
    const result = classifyTaxDocument({
      originalFileName: "inss.csv",
      text: [
        "Instituto Nacional do Seguro Social",
        "Historico de Creditos",
        "Beneficio NB: 123",
        "Competencia 01/2026",
      ].join("\n"),
    });

    expect(result.documentType).toBe("income_report_inss");
    expect(result.sourceLabelSuggestion).toBe("INSS");
  });

  it("detecta comprovante anual do INSS antes de cair no classifier de empregador", () => {
    const result = classifyTaxDocument({
      originalFileName: "inss-anual.pdf",
      text: [
        "Ministerio da Economia Comprovante de Rendimentos Pagos e de",
        "Imposto sobre a Renda Retido na Fonte",
        "Exercicio de 2026 Ano-calendario de 2025",
        "16.727.230/0001-97 Fundo do Regime Geral de Previdencia Social",
        "Numero do Beneficio",
        "Parcela isenta do 13o salario de aposentadoria 1.903,98",
      ].join("\n"),
    });

    expect(result.documentType).toBe("income_report_inss");
    expect(result.sourceLabelSuggestion).toBe("INSS");
  });

  it("detecta demonstrativo medico", () => {
    const result = classifyTaxDocument({
      originalFileName: "unimed.csv",
      text: [
        "Plano de Saude Unimed",
        "Demonstrativo para imposto de renda",
        "Beneficiario Joao da Silva",
        "Total de despesas R$ 1.240,00",
      ].join("\n"),
    });

    expect(result.documentType).toBe("medical_statement");
    expect(result.sourceLabelSuggestion).toBe("Unimed");
  });

  it("detecta comprovante educacional", () => {
    const result = classifyTaxDocument({
      originalFileName: "faculdade.csv",
      text: [
        "Instituicao de ensino Universidade Exemplo",
        "Comprovante de Pagamento",
        "Aluno Maria Souza",
        "Mensalidade R$ 850,00",
      ].join("\n"),
    });

    expect(result.documentType).toBe("education_receipt");
  });

  it("detecta extrato de apoio como bank_statement_support", () => {
    const result = classifyTaxDocument({
      originalFileName: "extrato.csv",
      text: [
        "Data;Historico;Valor",
        "05/02/2026;Saldo anterior;100,00",
        "06/02/2026;Lancamentos;20,00",
      ].join("\n"),
    });

    expect(result.documentType).toBe("bank_statement_support");
  });

  it("retorna unknown quando nao encontra sinais suficientes", () => {
    const result = classifyTaxDocument({
      originalFileName: "arquivo.pdf",
      text: "qualquer conteudo sem pistas fiscais claras",
    });

    expect(result.documentType).toBe("unknown");
  });
});
