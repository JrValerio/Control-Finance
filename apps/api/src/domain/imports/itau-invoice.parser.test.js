import { describe, it, expect } from "vitest";
import { parseBRL, parseDMY, parseItauInvoice } from "./itau-invoice.parser.js";

// ─── parseBRL ─────────────────────────────────────────────────────────────────

describe("parseBRL", () => {
  it("converte formato brasileiro com milhar e decimal", () => {
    expect(parseBRL("1.247,80")).toBe(1247.80);
  });

  it("converte valor sem milhar", () => {
    expect(parseBRL("247,80")).toBe(247.80);
  });

  it("converte valor sem centavos fracionados", () => {
    expect(parseBRL("500,00")).toBe(500.00);
  });

  it("retorna null para string vazia", () => {
    expect(parseBRL("")).toBeNull();
  });

  it("retorna null para valor zero", () => {
    expect(parseBRL("0,00")).toBeNull();
  });

  it("retorna null para input nao string", () => {
    expect(parseBRL(null)).toBeNull();
    expect(parseBRL(undefined)).toBeNull();
  });
});

// ─── parseDMY ─────────────────────────────────────────────────────────────────

describe("parseDMY", () => {
  it("converte DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(parseDMY("15/03/2026")).toBe("2026-03-15");
  });

  it("retorna null para formato errado", () => {
    expect(parseDMY("2026-03-15")).toBeNull();
    expect(parseDMY("15-03-2026")).toBeNull();
  });

  it("retorna null para data invalida", () => {
    expect(parseDMY("32/13/2026")).toBeNull();
  });

  it("retorna null para input nao string", () => {
    expect(parseDMY(null)).toBeNull();
  });
});

// ─── parseItauInvoice ─────────────────────────────────────────────────────────

// Helper to build a realistic Itaú invoice excerpt
const buildItauText = (overrides = {}) => {
  const defaults = {
    total: "TOTAL DA FATURA    R$ 1.247,80",
    vencimento: "VENCIMENTO  15/03/2026",
    periodo: "PERÍODO DE 08/02/2026 A 07/03/2026",
    minimo: "PAGAMENTO MÍNIMO R$ 124,78",
    financiado: null,
    last4: "**** 1234",
  };
  const config = { ...defaults, ...overrides };

  return [
    "BANCO ITAÚ S.A.",
    config.last4,
    config.periodo,
    config.vencimento,
    config.total,
    config.minimo,
    config.financiado,
  ]
    .filter(Boolean)
    .join("\n");
};

describe("parseItauInvoice", () => {
  it("parse completo — retorna todos os campos com alta confiança", () => {
    const text = buildItauText();
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.totalAmount).toBe(1247.80);
    expect(result.dueDate).toBe("2026-03-15");
    expect(result.periodStart).toBe("2026-02-08");
    expect(result.periodEnd).toBe("2026-03-07");
    expect(result.minimumPayment).toBe(124.78);
    expect(result.financedBalance).toBeNull();
    expect(result.cardLast4).toBe("1234");
    expect(result.issuer).toBe("itau");
    expect(result.fieldsSources.totalAmount).toContain("regex:");
    expect(result.fieldsSources.dueDate).toContain("regex:");
    expect(result.fieldsSources.periodStart).toContain("regex:");
  });

  it("parse sem período — periodStart e periodEnd ficam null", () => {
    const text = buildItauText({ periodo: null });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
    expect(result.fieldsSources.periodStart).toBeNull();
  });

  it("retorna null quando totalAmount nao encontrado", () => {
    const text = buildItauText({ total: "INFORMACOES DA FATURA" });
    expect(parseItauInvoice(text)).toBeNull();
  });

  it("retorna null quando dueDate nao encontrado", () => {
    const text = buildItauText({ vencimento: "SEM DATA" });
    expect(parseItauInvoice(text)).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(parseItauInvoice("")).toBeNull();
  });

  it("retorna null para input nao string", () => {
    expect(parseItauInvoice(null)).toBeNull();
    expect(parseItauInvoice(undefined)).toBeNull();
  });

  it("extrai SALDO FINANCIADO quando presente", () => {
    const text = buildItauText({ financiado: "SALDO FINANCIADO R$ 623,90" });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.financedBalance).toBe(623.90);
  });

  it("extrai SALDO A FINANCIAR como alternativa a SALDO FINANCIADO", () => {
    const text = buildItauText({ financiado: "SALDO A FINANCIAR R$ 311,95" });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.financedBalance).toBe(311.95);
  });

  it("extrai cardLast4 no formato 'final 5678'", () => {
    const text = buildItauText({ last4: "Cartão final 5678" });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.cardLast4).toBe("5678");
  });

  it("funciona sem cardLast4 no texto", () => {
    const text = buildItauText({ last4: null });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.cardLast4).toBeNull();
  });

  it("rawExcerpt contem os primeiros 800 chars do texto normalizado", () => {
    const text = buildItauText();
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(typeof result.rawExcerpt).toBe("string");
    expect(result.rawExcerpt.length).toBeLessThanOrEqual(800);
    expect(result.rawExcerpt).toContain("ITAÚ");
  });

  it("aceita variacao 'VALOR TOTAL DA FATURA' para totalAmount", () => {
    const text = buildItauText({
      total: "VALOR TOTAL DA FATURA R$ 850,00",
    });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.totalAmount).toBe(850.00);
  });

  it("aceita variacao 'VENCE EM' para dueDate", () => {
    const text = buildItauText({ vencimento: "VENCE EM 20/03/2026" });
    const result = parseItauInvoice(text);

    expect(result).not.toBeNull();
    expect(result.dueDate).toBe("2026-03-20");
  });
});
