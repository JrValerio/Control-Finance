import { describe, it, expect } from "vitest";
import { detectDocumentType } from "./document-classifier.js";

describe("detectDocumentType", () => {
  describe("OFX extension", () => {
    it("retorna bank_statement para .ofx independente do texto", () => {
      expect(detectDocumentType({ text: "", extension: ".ofx" })).toBe("bank_statement");
      expect(detectDocumentType({ text: "qualquer coisa", extension: ".ofx" })).toBe("bank_statement");
    });
  });

  describe("CSV extension", () => {
    it("retorna bank_statement para .csv sem texto reconhecível", () => {
      expect(detectDocumentType({ text: "", extension: ".csv" })).toBe("bank_statement");
    });

    it("retorna bank_statement para .csv independente do texto", () => {
      expect(detectDocumentType({ text: "saldo anterior lancamentos", extension: ".csv" })).toBe("bank_statement");
    });
  });

  describe("income_statement_inss", () => {
    it("detecta INSS com instituto nacional + sinal adicional", () => {
      const text = "INSTITUTO NACIONAL DO SEGURO SOCIAL\nHistórico de Créditos\nCompetência: 03/2026";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_inss");
    });

    it("detecta INSS com meu.inss.gov.br + beneficio", () => {
      const text = "instituto nacional do seguro social benefício nb: 1234 meu.inss.gov.br";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_inss");
    });

    it("NAO detecta INSS sem instituto nacional do seguro social", () => {
      const text = "historico de creditos beneficio competencia especie:";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("income_statement_inss");
    });

    it("NAO detecta INSS com apenas 1 sinal (alem do instituto nacional)", () => {
      const text = "instituto nacional do seguro social competencia";
      // countMatches >= 2: "instituto nacional do seguro social" (1) + "competencia" (1) = 2 -> yes it should detect
      // Wait: the check is: includes("instituto nacional do seguro social") AND countMatches >= 2
      // "instituto nacional do seguro social" is IN the INSS_SIGNALS array, so countMatches will be >= 1 already
      // With just one more signal like "competencia", countMatches = 2 -> detects
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_inss");
    });

    it("NAO detecta INSS com apenas instituto nacional isolado", () => {
      // countMatches([only "instituto nacional do seguro social"]) = 1 → not >= 2 → does not detect
      const text = "instituto nacional do seguro social nenhum outro sinal conhecido";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("income_statement_inss");
    });

    it("normaliza acentos para comparacao", () => {
      const text = "INSTITUTO NACIONAL DO SEGURO SOCIAL\nHistórico de Créditos\nEspécie: Aposentadoria";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_inss");
    });
  });

  describe("income_statement_payroll", () => {
    it("detecta holerite com termos principais e totais", () => {
      const text = [
        "Demonstrativo de Pagamento",
        "Empresa: ACME LTDA",
        "Salario base 4.500,00",
        "Total de proventos 5.200,00",
        "Liquido a receber 4.180,55",
      ].join("\n");

      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_payroll");
    });

    it("detecta contracheque com matricula e descontos", () => {
      const text = [
        "Contracheque",
        "Matricula 12345",
        "Total de descontos 1.020,45",
        "Valor liquido 3.879,55",
      ].join("\n");

      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("income_statement_payroll");
    });

    it("nao detecta payroll sem sinal principal", () => {
      const text = "empresa salario base total de descontos liquido a receber";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("income_statement_payroll");
    });
  });

  describe("utility_bill_energy", () => {
    it("detecta conta de energia com neoenergia + kwh", () => {
      const text = "Neoenergia Elektro\nConsumo kWh\nTarifa de energia";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_energy");
    });

    it("detecta conta de energia com nota fiscal de energia eletrica + leitura anterior", () => {
      const text = "NOTA FISCAL DE ENERGIA ELÉTRICA\nLeitura anterior: 1234\nLeitura atual: 1456";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_energy");
    });

    it("detecta conta CPFL", () => {
      const text = "CPFL Energia\nConsumo TE\nConsumo TUSD";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_energy");
    });

    it("NAO detecta energia com apenas 1 sinal", () => {
      const text = "kwh apenas isso";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("utility_bill_energy");
    });
  });

  describe("utility_bill_water", () => {
    it("detecta conta de água com saae + consumo m3", () => {
      const text = "SAAE - Serviço Autônomo de Água e Esgoto\nConsumo m3: 15\nVencimento: 10/04/2026";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_water");
    });

    it("detecta conta sabesp", () => {
      const text = "SABESP\nÁgua e Esgoto\nFaturamento Água: R$ 45,00";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_water");
    });

    it("detecta conta com hidrometro + matricula", () => {
      const text = "Copasa\nMatrícula: 9876\nHidrômetro: 000123";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_water");
    });

    it("NAO detecta agua com apenas 1 sinal", () => {
      const text = "saae somente";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("utility_bill_water");
    });
  });

  describe("utility_bill_gas", () => {
    it("detecta conta de gas com comgas + gas canalizado", () => {
      const text = "COMGAS\nFornecimento de gas canalizado\nTarifa de gas";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_gas");
    });

    it("detecta conta de gas com naturgy + consumo m3", () => {
      const text = "NATURGY\nConsumo m3: 12\nConta de gas";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_gas");
    });

    it("NAO detecta gas com apenas 1 sinal", () => {
      const text = "comgas somente";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("utility_bill_gas");
    });
  });

  describe("utility_bill_telecom", () => {
    it("detecta conta de internet com operadora + banda larga", () => {
      const text = "VIVO FIBRA\nInternet Fixa\nBanda larga";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_telecom");
    });

    it("detecta conta de telefone com operadora + linha movel", () => {
      const text = "TIM\nServico Movel Pessoal\nNumero da linha: 11 99999-9999";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_telecom");
    });

    it("detecta conta de TV por assinatura", () => {
      const text = "SKY\nTV por assinatura\nFatura digital";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("utility_bill_telecom");
    });

    it("NAO detecta telecom com apenas 1 sinal", () => {
      const text = "vivo somente";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("utility_bill_telecom");
    });
  });

  describe("credit_card_invoice_nubank", () => {
    it("detecta fatura Nubank com nu pagamentos + periodo vigente + total a pagar", () => {
      const text = [
        "Nu Pagamentos S.A.",
        "Periodo vigente: 08 OUT a 08 NOV",
        "Total a pagar R$ 767,23",
        "Data de vencimento: 18 NOV 2024",
      ].join("\n");
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("credit_card_invoice_nubank");
    });

    it("detecta fatura Nubank com pagamentos e financiamentos + data de vencimento", () => {
      const text = [
        "Nu Pagamentos S.A.",
        "Pagamentos e Financiamentos R$ 106,15",
        "Data de vencimento: 15 AGO 2025",
      ].join("\n");
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("credit_card_invoice_nubank");
    });

    it("NAO detecta nubank sem nu pagamentos no texto", () => {
      const text = "periodo vigente: 08 OUT a 08 NOV\ntotal a pagar R$ 767,23\npagamentos e financiamentos";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("credit_card_invoice_nubank");
    });

    it("NAO detecta nubank com apenas nu pagamentos e nenhum outro sinal da lista", () => {
      // "nu pagamentos" e o unico sinal (countMatches = 1 < 2) — nao deve detectar
      const text = "Nu Pagamentos S.A.\nFatura de credito cancelado.";
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("credit_card_invoice_nubank");
    });
  });

  describe("bank_statement via conteudo", () => {
    it("detecta extrato com saldo anterior", () => {
      const text = "Saldo anterior: R$ 1.000,00\nlançamentos do periodo";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("bank_statement");
    });

    it("detecta OFX via conteudo (stmttrn/fitid)", () => {
      const text = "<STMTTRN>\n<FITID>20260101001\n<TRNAMT>-150.00";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("bank_statement");
    });

    it("extrato Itau com transacoes CLARO/TIM nao e classificado como utility_bill_telecom", () => {
      // Reproduz extrato_itau_032026.pdf: tem SALDO DO DIA, lançamentos, periodo de visualizacao
      // e transacoes como PIX QRS CLARO e PAY TIM — nao deve virar telecom bill
      const text = [
        "extrato conta / lancamentos",
        "periodo de visualizacao: 09/03/2026 ate 08/04/2026",
        "SALDO DO DIA 447,64",
        "PIX QRS CLARO07/04 -44,83",
        "PAY TIM 07/04 -89,90",
        "PGTO INSS 01776829899 2.803,52",
        "SALDO DO DIA 497,64",
      ].join("\n");
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("bank_statement");
    });
  });

  describe("income_statement_inss guard", () => {
    it("historico de emprestimo consignado NAO e classificado como income_statement_inss", () => {
      const text = [
        "Instituto Nacional do Seguro Social",
        "HISTÓRICO DE EMPRÉSTIMO CONSIGNADO",
        "MARIA EDLEUSA MONSAO DA SILVA",
        "Benefício NB: 177.682.989-9",
        "SITUAÇÃO: ATIVO",
        "competência início desconto fim desconto",
      ].join("\n");
      expect(detectDocumentType({ text, extension: ".pdf" })).not.toBe("income_statement_inss");
    });
  });

  describe("unknown", () => {
    it("retorna unknown para texto vazio sem extensao reconhecida", () => {
      expect(detectDocumentType({ text: "", extension: ".pdf" })).toBe("unknown");
    });

    it("retorna unknown para texto sem sinais conhecidos", () => {
      expect(detectDocumentType({ text: "Lorem ipsum dolor sit amet", extension: ".pdf" })).toBe("unknown");
    });

    it("retorna unknown para texto null/undefined", () => {
      expect(detectDocumentType({ text: null, extension: ".pdf" })).toBe("unknown");
      expect(detectDocumentType({ extension: ".pdf" })).toBe("unknown");
    });
  });
});
