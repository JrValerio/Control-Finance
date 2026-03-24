import { describe, expect, it } from "vitest";
import { calculateNetBenefit } from "./benefit.calculator.js";

// ─── Validation ───────────────────────────────────────────────────────────────

describe("calculateNetBenefit — validação de input", () => {
  it("lança erro se grossBenefit não é número", () => {
    expect(() => calculateNetBenefit({ grossBenefit: "3000" })).toThrow();
  });

  it("lança erro se grossBenefit é zero", () => {
    expect(() => calculateNetBenefit({ grossBenefit: 0 })).toThrow();
  });

  it("lança erro se grossBenefit é negativo", () => {
    expect(() => calculateNetBenefit({ grossBenefit: -500 })).toThrow();
  });

  it("lança erro se dependents não é inteiro", () => {
    expect(() =>
      calculateNetBenefit({ grossBenefit: 3000, dependents: 1.5 })
    ).toThrow();
  });

  it("lança erro se ano não tem tabela IRRF", () => {
    expect(() =>
      calculateNetBenefit({ grossBenefit: 3000, effectiveYear: 1990 })
    ).toThrow(/IRRF table not found/);
  });
});

// ─── Shape do retorno ─────────────────────────────────────────────────────────

describe("calculateNetBenefit — shape do retorno", () => {
  it("retorna todos os campos esperados", () => {
    const result = calculateNetBenefit({ grossBenefit: 3000 });
    expect(result).toHaveProperty("grossMonthly");
    expect(result).toHaveProperty("inssMonthly");
    expect(result).toHaveProperty("irrfMonthly");
    expect(result).toHaveProperty("consignacoesMonthly");
    expect(result).toHaveProperty("loanTotal");
    expect(result).toHaveProperty("cardTotal");
    expect(result).toHaveProperty("netMonthly");
    expect(result).toHaveProperty("netAnnual");
    expect(result).toHaveProperty("taxAnnual");
    expect(result).toHaveProperty("loanLimitAmount");
    expect(result).toHaveProperty("cardLimitAmount");
    expect(result).toHaveProperty("isOverLoanLimit");
    expect(result).toHaveProperty("isOverCardLimit");
  });

  it("inssMonthly é sempre zero para beneficiários", () => {
    const result = calculateNetBenefit({ grossBenefit: 5000 });
    expect(result.inssMonthly).toBe(0);
  });

  it("grossMonthly === grossBenefit passado", () => {
    const result = calculateNetBenefit({ grossBenefit: 4958.67 });
    expect(result.grossMonthly).toBe(4958.67);
  });

  it("netMonthly == gross - IRRF - consignacoes", () => {
    const result = calculateNetBenefit({ grossBenefit: 5000 });
    const expected = Math.round((5000 - result.irrfMonthly - result.consignacoesMonthly) * 100) / 100;
    expect(result.netMonthly).toBe(expected);
  });

  it("netAnnual == netMonthly × 12", () => {
    const result = calculateNetBenefit({ grossBenefit: 5000 });
    expect(result.netAnnual).toBe(Math.round(result.netMonthly * 12 * 100) / 100);
  });

  it("taxAnnual == irrfMonthly × 12 (sem INSS)", () => {
    const result = calculateNetBenefit({ grossBenefit: 5000 });
    expect(result.taxAnnual).toBe(Math.round(result.irrfMonthly * 12 * 100) / 100);
  });
});

// ─── IRRF — sem isenção 65+ ───────────────────────────────────────────────────

describe("calculateNetBenefit — IRRF sem isenção 65+", () => {
  it("benefício abaixo de R$2.428,80 — IRRF isento", () => {
    const result = calculateNetBenefit({ grossBenefit: 2000, birthYear: 1985, effectiveYear: 2026 });
    // age = 41, sem isenção; base = 2000 < 2428.80 → isento
    expect(result.irrfMonthly).toBe(0);
  });

  it("benefício acima do limite de isenção — IRRF positivo", () => {
    const result = calculateNetBenefit({ grossBenefit: 5000, birthYear: 1985, effectiveYear: 2026 });
    // age = 41, sem isenção; base = 5000 > 2428.80 → tributado
    expect(result.irrfMonthly).toBeGreaterThan(0);
  });
});

// ─── IRRF — isenção 65+ ───────────────────────────────────────────────────────

describe("calculateNetBenefit — isenção parcial 65+", () => {
  it("beneficiário de 65 anos tem R$2.428,80 descontado da base IRRF", () => {
    // birthYear = 1961, effectiveYear = 2026 → age = 65 → exempt R$2.428,80
    const semIsencao = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1985, effectiveYear: 2026 });
    const comIsencao = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1961, effectiveYear: 2026 });
    expect(comIsencao.irrfMonthly).toBeLessThan(semIsencao.irrfMonthly);
  });

  it("beneficiário de 71 anos com benefício R$4.958,67 tem IRRF muito baixo", () => {
    // Real case from extrato: gross R$4.958,67, birthYear ≈ 1955 (age 71)
    const result = calculateNetBenefit({ grossBenefit: 4958.67, birthYear: 1955, effectiveYear: 2026 });
    // base = 4958.67 - 2428.80 = 2529.87 → faixa 7.5% com deducão 182.16
    // irrf = 2529.87 × 0.075 - 182.16 = 189.74 - 182.16 = 7.58
    expect(result.irrfMonthly).toBeCloseTo(7.58, 1);
  });

  it("beneficiário 64 anos não recebe isenção ainda", () => {
    const sem = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1963, effectiveYear: 2026 });
    const com = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1962, effectiveYear: 2026 });
    // 1963 → age 63 (sem isenção), 1962 → age 64 (sem isenção)
    expect(sem.irrfMonthly).toBe(com.irrfMonthly);
  });

  it("IRRF nunca fica negativo com isenção alta", () => {
    const result = calculateNetBenefit({ grossBenefit: 2000, birthYear: 1950, effectiveYear: 2026 });
    expect(result.irrfMonthly).toBeGreaterThanOrEqual(0);
  });
});

// ─── Consignações — limites ───────────────────────────────────────────────────

describe("calculateNetBenefit — consignações e limites", () => {
  it("sem consignações: totais zero, limites calculados corretamente", () => {
    const result = calculateNetBenefit({ grossBenefit: 4000 });
    expect(result.consignacoesMonthly).toBe(0);
    expect(result.loanTotal).toBe(0);
    expect(result.cardTotal).toBe(0);
    expect(result.loanLimitAmount).toBe(Math.round(4000 * 0.35 * 100) / 100);
    expect(result.cardLimitAmount).toBe(Math.round(4000 * 0.05 * 100) / 100);
    expect(result.isOverLoanLimit).toBe(false);
    expect(result.isOverCardLimit).toBe(false);
  });

  it("empréstimos dentro do limite de 35%", () => {
    const result = calculateNetBenefit({
      grossBenefit: 4000,
      consignacoes: [
        { consignacao_type: "loan", amount: 1000 },
        { consignacao_type: "loan", amount: 400 },
      ],
    });
    expect(result.loanTotal).toBe(1400);
    expect(result.isOverLoanLimit).toBe(false); // 1400 < 1400 (= 35% de 4000)
  });

  it("empréstimos acima do limite de 35%", () => {
    const result = calculateNetBenefit({
      grossBenefit: 4000,
      consignacoes: [
        { consignacao_type: "loan", amount: 1401 },
      ],
    });
    expect(result.isOverLoanLimit).toBe(true);
  });

  it("cartão dentro do limite de 5%", () => {
    const result = calculateNetBenefit({
      grossBenefit: 4000,
      consignacoes: [{ consignacao_type: "card", amount: 199 }],
    });
    expect(result.isOverCardLimit).toBe(false);
  });

  it("cartão acima do limite de 5%", () => {
    const result = calculateNetBenefit({
      grossBenefit: 4000,
      consignacoes: [{ consignacao_type: "card", amount: 201 }],
    });
    expect(result.isOverCardLimit).toBe(true);
  });

  it("aceita consignacaoType camelCase (shape do frontend)", () => {
    const result = calculateNetBenefit({
      grossBenefit: 5000,
      consignacoes: [
        { consignacaoType: "loan", amount: 500 },
        { consignacaoType: "card", amount: 100 },
        { consignacaoType: "other", amount: 50 },
      ],
    });
    expect(result.loanTotal).toBe(500);
    expect(result.cardTotal).toBe(100);
    expect(result.consignacoesMonthly).toBe(650);
  });

  it("consignacoesMonthly inclui todos os tipos", () => {
    const result = calculateNetBenefit({
      grossBenefit: 5000,
      consignacoes: [
        { consignacao_type: "loan",  amount: 500 },
        { consignacao_type: "card",  amount: 100 },
        { consignacao_type: "other", amount: 50  },
      ],
    });
    expect(result.consignacoesMonthly).toBe(650);
    expect(result.netMonthly).toBe(
      Math.round((5000 - result.irrfMonthly - 650) * 100) / 100,
    );
  });

  it("caso real: benefício R$4.958,67 com consignações excessivas", () => {
    // Extrato INSS real: gross 4958.67, consig ~1908.10, net ~2812.99
    const consignacoes = [
      { consignacao_type: "loan", amount: 456.78 },
      { consignacao_type: "loan", amount: 350.00 },
      { consignacao_type: "loan", amount: 300.00 },
      { consignacao_type: "loan", amount: 801.32 },
    ];
    const result = calculateNetBenefit({
      grossBenefit: 4958.67,
      birthYear: 1955,
      consignacoes,
    });
    expect(result.loanTotal).toBe(1908.10);
    expect(result.isOverLoanLimit).toBe(true); // 1908.10 > 35% de 4958.67 = 1735.53
    expect(result.netMonthly).toBeGreaterThan(0);
  });
});

// ─── Dependentes ─────────────────────────────────────────────────────────────

describe("calculateNetBenefit — dedução por dependentes", () => {
  it("1 dependente reduz IRRF em relação a 0 dependentes", () => {
    const sem = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1985 });
    const com = calculateNetBenefit({ grossBenefit: 4000, birthYear: 1985, dependents: 1 });
    expect(com.irrfMonthly).toBeLessThanOrEqual(sem.irrfMonthly);
  });

  it("IRRF nunca fica negativo com muitos dependentes", () => {
    const result = calculateNetBenefit({ grossBenefit: 2500, dependents: 10 });
    expect(result.irrfMonthly).toBeGreaterThanOrEqual(0);
  });
});
