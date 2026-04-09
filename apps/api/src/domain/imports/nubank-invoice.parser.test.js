import { describe, it, expect } from "vitest";
import {
  parseNubankBRL,
  parseNubankInvoice,
  parseNubankInvoiceTransactions,
} from "./nubank-invoice.parser.js";

// ─── parseNubankBRL ───────────────────────────────────────────────────────────

describe("parseNubankBRL", () => {
  it("converte 'R$ 767,23' para 767.23", () => {
    expect(parseNubankBRL("R$ 767,23")).toBe(767.23);
  });

  it("converte 'R$ 1.247,80' para 1247.80", () => {
    expect(parseNubankBRL("R$ 1.247,80")).toBe(1247.8);
  });

  it("converte sem prefixo R$ — '103,09'", () => {
    expect(parseNubankBRL("103,09")).toBe(103.09);
  });

  it("converte sem milhar — '34,99'", () => {
    expect(parseNubankBRL("34,99")).toBe(34.99);
  });

  it("retorna null para zero", () => {
    expect(parseNubankBRL("R$ 0,00")).toBeNull();
    expect(parseNubankBRL("0,00")).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(parseNubankBRL("")).toBeNull();
  });

  it("retorna null para input nao string", () => {
    expect(parseNubankBRL(null)).toBeNull();
    expect(parseNubankBRL(undefined)).toBeNull();
  });
});

// ─── parseNubankInvoice ───────────────────────────────────────────────────────

const buildNubankText = (overrides = {}) => {
  const defaults = {
    header: "Nu Pagamentos S.A.",
    last4: "Cartao final 9988",
    vencimento: "Data de vencimento: 18 NOV 2024",
    periodo: "Periodo vigente: 08 OUT a 08 NOV",
    total: "Total a pagar R$ 767,23",
    minimo: "Pagamento minimo R$ 172,28",
  };
  const config = { ...defaults, ...overrides };

  return Object.values(config).filter(Boolean).join("\n");
};

describe("parseNubankInvoice", () => {
  it("parse completo — retorna todos os campos", () => {
    const text = buildNubankText();
    const result = parseNubankInvoice(text);

    expect(result).not.toBeNull();
    expect(result.totalAmount).toBe(767.23);
    expect(result.dueDate).toBe("2024-11-18");
    expect(result.periodStart).toBe("2024-10-08");
    expect(result.periodEnd).toBe("2024-11-08");
    expect(result.minimumPayment).toBe(172.28);
    expect(result.financedBalance).toBeNull();
    expect(result.cardLast4).toBe("9988");
    expect(result.issuer).toBe("nubank");
    expect(result.fieldsSources.totalAmount).toContain("regex:");
    expect(result.fieldsSources.dueDate).toContain("regex:");
    expect(result.fieldsSources.periodStart).toContain("regex:");
  });

  it("parse sem periodo — periodStart e periodEnd ficam null", () => {
    const text = buildNubankText({ periodo: null });
    const result = parseNubankInvoice(text);

    expect(result).not.toBeNull();
    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
    expect(result.fieldsSources.periodStart).toBeNull();
    expect(result.fieldsSources.periodEnd).toBeNull();
  });

  it("retorna null quando totalAmount nao encontrado", () => {
    const text = buildNubankText({ total: "sem total aqui" });
    expect(parseNubankInvoice(text)).toBeNull();
  });

  it("retorna null quando dueDate nao encontrado", () => {
    const text = buildNubankText({ vencimento: "sem data aqui" });
    expect(parseNubankInvoice(text)).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(parseNubankInvoice("")).toBeNull();
  });

  it("retorna null para input nao string", () => {
    expect(parseNubankInvoice(null)).toBeNull();
    expect(parseNubankInvoice(undefined)).toBeNull();
  });

  it("nao retorna rawExcerpt no objeto parseado", () => {
    const result = parseNubankInvoice(buildNubankText());
    expect(result).not.toBeNull();
    expect(result.rawExcerpt).toBeUndefined();
  });

  it("aceita variacao 'Total a pagar R$ X.XXX,XX' com milhar", () => {
    const text = buildNubankText({ total: "Total a pagar R$ 1.247,80" });
    const result = parseNubankInvoice(text);
    expect(result).not.toBeNull();
    expect(result.totalAmount).toBe(1247.8);
  });

  it("extrai cardLast4 no formato 'Cartao final XXXX'", () => {
    const text = buildNubankText({ last4: "Cartao final 1234" });
    const result = parseNubankInvoice(text);
    expect(result?.cardLast4).toBe("1234");
  });

  it("funciona sem cardLast4 no texto", () => {
    const text = buildNubankText({ last4: null });
    const result = parseNubankInvoice(text);
    expect(result).not.toBeNull();
    expect(result.cardLast4).toBeNull();
  });

  it("infere ano anterior no startYear para periodo cruzando virada de ano (DEZ a JAN)", () => {
    const text = buildNubankText({
      vencimento: "Data de vencimento: 15 JAN 2026",
      periodo: "Periodo vigente: 08 DEZ a 08 JAN",
      total: "Total a pagar R$ 500,00",
    });
    const result = parseNubankInvoice(text);
    expect(result).not.toBeNull();
    expect(result.periodStart).toBe("2025-12-08");
    expect(result.periodEnd).toBe("2026-01-08");
  });

  it("aceita 'Valor para pagamento a vista' como fallback de totalAmount", () => {
    const text = buildNubankText({
      total: "Valor para pagamento a vista R$ 504,16",
    });
    const result = parseNubankInvoice(text);
    expect(result).not.toBeNull();
    expect(result.totalAmount).toBe(504.16);
  });

  it("issuer e sempre nubank", () => {
    const result = parseNubankInvoice(buildNubankText());
    expect(result?.issuer).toBe("nubank");
  });
});

// ─── parseNubankInvoiceTransactions ──────────────────────────────────────────

const SAMPLE_TX_TEXT = `
Nu Pagamentos S.A.
Cartao final 9988
Data de vencimento: 18 NOV 2024
Periodo vigente: 08 OUT a 08 NOV
Total a pagar R$ 767,23
Pagamento minimo R$ 172,28
TRANSACOES DE 08 OUT A 08 NOV
Amaro Valerio da Silva Junior R$ 0,00
Pagamentos e Financiamentos R$ 399,51
15 OUT Credito de rotativo -R$ 399,51
15 OUT Saldo em rotativo R$ 399,51
• Saldo em aberto de R$ 466,80. Valor total acumulado de juros de R$ 64,73
. Valor do iof R$ 2,55.
• Valor original: R$ 402,06
15 OUT Pagamento em 15 OUT -R$ 170,90
21 OUT Dl *Google Youtube R$ 13,90
24 OUT Linkedin R$ 34,99
27 OUT Atibaia Gavioes R$ 99,00
30 OUT Paypal *Discord R$ 25,96
BRL 24.99 = USD 4.38
Conversao: BRL 5.92 = USD 1 = R$ 5,92
30 OUT IOF de Paypal *Discord R$ 1,13
31 OUT Juros de rotativo R$ 64,73
05 NOV IOF de rotativo R$ 2,55
`.trim();

describe("parseNubankInvoiceTransactions", () => {
  it("extrai transacoes validas e filtra pagamentos e creditos", () => {
    const rows = parseNubankInvoiceTransactions(SAMPLE_TX_TEXT);
    const descriptions = rows.map((r) => r.raw.description);

    expect(descriptions).toContain("Dl *Google Youtube");
    expect(descriptions).toContain("Linkedin");
    expect(descriptions).toContain("Atibaia Gavioes");
    expect(descriptions).toContain("Paypal *Discord");
    expect(descriptions).toContain("IOF de Paypal *Discord");
    expect(descriptions).toContain("Juros de rotativo");
    expect(descriptions).toContain("IOF de rotativo");
  });

  it("filtra Credito de rotativo, Saldo em rotativo e Pagamento em", () => {
    const rows = parseNubankInvoiceTransactions(SAMPLE_TX_TEXT);
    const descriptions = rows.map((r) => r.raw.description);

    expect(descriptions).not.toContain("Credito de rotativo");
    expect(descriptions).not.toContain("Saldo em rotativo");
    expect(descriptions).not.toContain("Pagamento em 15 OUT");
  });

  it("nao inclui cabecalhos de secao ou linhas de continuacao", () => {
    const rows = parseNubankInvoiceTransactions(SAMPLE_TX_TEXT);
    const descriptions = rows.map((r) => r.raw.description);

    expect(descriptions).not.toContain("Amaro Valerio da Silva Junior");
    expect(descriptions).not.toContain("Pagamentos e Financiamentos");
    // BRL / Conversao lines must not appear
    expect(descriptions.some((d) => /^brl\s/i.test(d))).toBe(false);
    expect(descriptions.some((d) => /^convers/i.test(d))).toBe(false);
  });

  it("mapeia tipo Saida para compras normais", () => {
    const rows = parseNubankInvoiceTransactions(SAMPLE_TX_TEXT);
    const youtube = rows.find((r) => r.raw.description === "Dl *Google Youtube");
    expect(youtube).toBeDefined();
    expect(youtube.raw.type).toBe("Saida");
    expect(youtube.raw.value).toBe("13.90");
    expect(youtube.raw.date).toBe("2024-10-21");
  });

  it("usa ano do dueDate para todos os meses do periodo", () => {
    const rows = parseNubankInvoiceTransactions(SAMPLE_TX_TEXT);
    const nov = rows.find((r) => r.raw.description === "IOF de rotativo");
    expect(nov?.raw.date).toBe("2024-11-05");
  });

  it("lanca erro para texto vazio", () => {
    expect(() => parseNubankInvoiceTransactions("")).toThrow();
  });

  it("lanca erro quando nenhuma transacao e reconhecida", () => {
    expect(() =>
      parseNubankInvoiceTransactions("Nu Pagamentos S.A.\nTexto sem transacoes validas."),
    ).toThrow("Nenhuma transacao reconhecida na fatura.");
  });

  it("transacao com valor negativo gera tipo Entrada", () => {
    const text = `
Nu Pagamentos S.A.
Data de vencimento: 18 NOV 2024
Total a pagar R$ 50,00
15 OUT Reembolso Mercado Livre -R$ 45,00
    `.trim();
    const rows = parseNubankInvoiceTransactions(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].raw.type).toBe("Entrada");
    expect(rows[0].raw.value).toBe("45.00");
    expect(rows[0].raw.description).toBe("Reembolso Mercado Livre");
  });

  it("reconhece compras internacionais quando o valor R$ fica em linha separada", () => {
    const text = `
Nu Pagamentos S.A.
Data de vencimento: 18 NOV 2024
Total a pagar R$ 146,14
30 OUT Paypal *Discord
BRL 24.99 = USD 4.38
Conversao: BRL 5.92 = USD 1 = R$ 5,92
R$ 25,96
31 OUT Openai *Chatgpt Subscr
USD 20.00
Conversao: USD 1 = R$ 6,00
R$ 120,18
    `.trim();

    const rows = parseNubankInvoiceTransactions(text);

    expect(rows).toHaveLength(2);
    expect(rows[0].raw).toMatchObject({
      date: "2024-10-30",
      type: "Saida",
      value: "25.96",
      description: "Paypal *Discord",
    });
    expect(rows[1].raw).toMatchObject({
      date: "2024-10-31",
      type: "Saida",
      value: "120.18",
      description: "Openai *Chatgpt Subscr",
    });
  });

  it("reconhece parcelamentos quando o detalhe ocupa varias linhas antes do valor da parcela", () => {
    const text = `
Nu Pagamentos S.A.
Data de vencimento: 09 MAR 2026
Total a pagar R$ 205,97
06 FEV Pagamento em 06 FEV −R$ 69,28
02 FEV MODA MUNDIAL BRASIL PAGAMENTOS LTDA - Parcela 2/2
Total a pagar: R$ 179,72 (valor da transação de R$ 152,48 + R$ 1,29 de IOF +
R$ 25,96 de juros) divididos em 2 parcelas de R$ 89,86.
R$ 89,86
09 FEV Encerramento de dívida R$ 0,00
09 FEV Encerramento de dívida R$ 0,00
09 FEV Juros de dívida encerrada R$ 0,00
09 FEV MILCA VALERIA MONSAO DA SILVA GARGIULO - Parcela 1/2
Total a pagar: R$ 57,21 (valor da transação de R$ 43,40 + R$ 0,45 de IOF +
R$ 13,37 de juros) divididos em 2 parcelas de R$ 28,61.
R$ 28,61
09 FEV SHPP BRASIL INSTITUICAO DE PAG - Parcela 1/2
Total a pagar: R$ 38,11 (valor da transação de R$ 30,89 + R$ 0,30 de IOF +
R$ 6,92 de juros) divididos em 2 parcelas de R$ 19,06.
R$ 19,06
09 FEV Juros de dívida encerrada R$ 0,00
09 FEV Zaine Simeia Valéria Monsão da Silva - Parcela 1/2
Total a pagar: R$ 136,89 (valor da transação de R$ 101,00 + R$ 1,13 de IOF +
R$ 34,76 de juros) divididos em 2 parcelas de R$ 68,45.
R$ 68,45
    `.trim();

    const rows = parseNubankInvoiceTransactions(text);

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.raw.description)).toEqual([
      "MODA MUNDIAL BRASIL PAGAMENTOS LTDA - Parcela 2/2",
      "MILCA VALERIA MONSAO DA SILVA GARGIULO - Parcela 1/2",
      "SHPP BRASIL INSTITUICAO DE PAG - Parcela 1/2",
      "Zaine Simeia Valéria Monsão da Silva - Parcela 1/2",
    ]);
    expect(rows.map((r) => r.raw.value)).toEqual([
      "89.86",
      "28.61",
      "19.06",
      "68.45",
    ]);
  });
});
