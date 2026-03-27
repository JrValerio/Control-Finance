import { describe, expect, it } from "vitest";
import {
  getPdfImportGuidanceError,
  extractPayrollSuggestion,
  parseGenericBankStatementPdfText,
  parseInssCreditHistoryPdfText,
  parseStatementCsvRows,
} from "./statement-import.js";

describe("statement import parser", () => {
  it("normaliza CSV de extrato bancario com colunas flexiveis e ignora saldo", () => {
    const csvContent = [
      "Data;Historico;Valor",
      "05/02/2026;PGTO INSS 01776829899;2812,99",
      "05/02/2026;SALDO DO DIA;2411,37",
      "06/02/2026;PIX QRS UBER DO BRA;-15,98",
    ].join("\n");

    const rows = parseStatementCsvRows(Buffer.from(csvContent, "utf8"));

    expect(rows).toEqual([
      {
        line: 2,
        raw: {
          date: "2026-02-05",
          type: "Entrada",
          value: "2812.99",
          description: "PGTO INSS 01776829899",
          notes: "",
          category: "",
        },
      },
      {
        line: 4,
        raw: {
          date: "2026-02-06",
          type: "Saida",
          value: "15.98",
          description: "PIX QRS UBER DO BRA",
          notes: "",
          category: "",
        },
      },
    ]);
  });

  it("lanca erro em CSV com header mas sem linhas de dados", () => {
    const csvContent = "Data;Historico;Valor\n";
    expect(() => parseStatementCsvRows(Buffer.from(csvContent, "utf8"))).toThrow("CSV vazio.");
  });

  it("lanca erro quando colunas do CSV nao sao reconheciveis", () => {
    const csvContent = "Coluna1;Coluna2;Coluna3\nA;B;C\n";
    expect(() => parseStatementCsvRows(Buffer.from(csvContent, "utf8"))).toThrow(
      "Nao foi possivel reconhecer as colunas do extrato.",
    );
  });

  it("orienta OFX ou CSV quando o PDF nao tem texto util e OCR esta desligado", () => {
    expect(getPdfImportGuidanceError("abc 123", false)).toBe(
      "PDF sem texto reconhecivel. Tente OFX ou CSV.",
    );
  });

  it("extrai linhas de PDF de extrato bancario e ignora saldo do dia", () => {
    const text = [
      "05/02/2026 PGTO INSS 01776829899 2.812,99",
      "05/02/2026 SALDO DO DIA 2.411,37",
      "06/02/2026 PIX QRS UBER DO BRA -15,98",
      "06/02/2026 PIX TRANSF ZAINE S11/02 95,00",
    ].join("\n");

    const rows = parseGenericBankStatementPdfText(text);

    expect(rows).toEqual([
      {
        line: 1,
        raw: {
          date: "2026-02-05",
          type: "Entrada",
          value: "2812.99",
          description: "PGTO INSS 01776829899",
          notes: "",
          category: "",
        },
      },
      {
        line: 3,
        raw: {
          date: "2026-02-06",
          type: "Saida",
          value: "15.98",
          description: "PIX QRS UBER DO BRA",
          notes: "",
          category: "",
        },
      },
      {
        line: 4,
        raw: {
          date: "2026-02-06",
          type: "Entrada",
          value: "95.00",
          description: "PIX TRANSF ZAINE S11/02",
          notes: "",
          category: "",
        },
      },
    ]);
  });

  it("entende extrato mensal com data curta e sinal negativo no fim", () => {
    const text = [
      "extrato mensal ag 3380 cc 59974-0 dez 2022",
      "06/12 Sispag Salários 960.903,71-",
      "Sispag Diversos TED 13.624,52-",
      "Sispag 2250JUCEMG 664.659,76",
      "Sispag 2250JUCEMG 314.143,10",
      "Saldo em C/C 0,00",
    ].join("\n");

    const rows = parseGenericBankStatementPdfText(text);

    expect(rows).toEqual([
      {
        line: 2,
        raw: {
          date: "2022-12-06",
          type: "Saida",
          value: "960903.71",
          description: "Sispag Salários",
          notes: "",
          category: "",
        },
      },
      {
        line: 3,
        raw: {
          date: "2022-12-06",
          type: "Saida",
          value: "13624.52",
          description: "Sispag Diversos TED",
          notes: "",
          category: "",
        },
      },
      {
        line: 4,
        raw: {
          date: "2022-12-06",
          type: "Entrada",
          value: "664659.76",
          description: "Sispag 2250JUCEMG",
          notes: "",
          category: "",
        },
      },
      {
        line: 5,
        raw: {
          date: "2022-12-06",
          type: "Entrada",
          value: "314143.10",
          description: "Sispag 2250JUCEMG",
          notes: "",
          category: "",
        },
      },
    ]);
  });

  it("extrai creditos do INSS com liquido e resumo de consignacoes nas notas", () => {
    const text = [
      "INSS - INSTITUTO NACIONAL DO SEGURO SOCIAL",
      "Historico de Creditos",
      "01/2026 R$ 2.812,99 CCF - CONTA-CORRENTE Pago 05/02/2026 Nao Nao 01/01/2026 a 31/01/2026 05/02/2026",
      "Banco: 341 - ITAU",
      "101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67",
      "216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 156,00",
      "216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 90,30",
      "217 EMPRESTIMO SOBRE A RMC R$ 238,00",
      "268 CONSIGNACAO - CARTAO R$ 238,46",
      "02/2026 R$ 2.803,52 CCF - CONTA-CORRENTE Nao Nao 01/02/2026 a 28/02/2026 05/03/2026",
      "Banco: 341 - ITAU",
      "101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67",
      "216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 542,60",
      "268 CONSIGNACAO - CARTAO R$ 247,93",
    ].join("\n");

    const rows = parseInssCreditHistoryPdfText(text);

    expect(rows).toEqual([
      {
        line: 3,
        raw: {
          date: "2026-02-05",
          type: "Entrada",
          value: "2812.99",
          description: "Credito INSS 01/2026",
          notes: "MR 4958.67 | 216 CONSIGNACAO EMPRESTIMO BANCARIO 156.00 | 216 CONSIGNACAO EMPRESTIMO BANCARIO 90.30 | 217 EMPRESTIMO SOBRE A RMC 238.00 | 268 CONSIGNACAO - CARTAO 238.46",
          category: "",
        },
      },
      {
        line: 10,
        raw: {
          date: "2026-03-05",
          type: "Entrada",
          value: "2803.52",
          description: "Credito INSS 02/2026",
          notes: "MR 4958.67 | 216 CONSIGNACAO EMPRESTIMO BANCARIO 542.60 | 268 CONSIGNACAO - CARTAO 247.93",
          category: "",
        },
      },
    ]);
  });

  it("extrai sugestao de holerite com bruto, liquido, descontos e empresa", () => {
    const text = [
      "Demonstrativo de Pagamento",
      "Empresa: ACME LTDA",
      "Competencia: 03/2026",
      "Data de pagamento: 30/03/2026",
      "Salario base 4.500,00",
      "Total de proventos 5.200,00",
      "Total de descontos 1.019,45",
      "Liquido a receber 4.180,55",
    ].join("\n");

    expect(extractPayrollSuggestion(text)).toEqual({
      type: "profile",
      profileKind: "clt",
      employerName: "ACME LTDA",
      referenceMonth: "2026-03",
      paymentDate: "2026-03-30",
      netAmount: 4180.55,
      grossAmount: 5200,
      deductions: [{ label: "descontos_folha", amount: 1019.45 }],
    });
  });
});
