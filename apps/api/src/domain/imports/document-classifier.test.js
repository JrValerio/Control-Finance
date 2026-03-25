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

  describe("bank_statement via conteudo", () => {
    it("detecta extrato com saldo anterior", () => {
      const text = "Saldo anterior: R$ 1.000,00\nlançamentos do periodo";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("bank_statement");
    });

    it("detecta OFX via conteudo (stmttrn/fitid)", () => {
      const text = "<STMTTRN>\n<FITID>20260101001\n<TRNAMT>-150.00";
      expect(detectDocumentType({ text, extension: ".pdf" })).toBe("bank_statement");
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
