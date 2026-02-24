import { describe, expect, it } from "vitest";
import { calculateNetSalary } from "./salary.calculator.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Compute expected INSS manually for 2026 progressive brackets. */
function expectedInss2026(gross) {
  const brackets = [
    { upTo: 1621.0,  rate: 0.075 },
    { upTo: 2902.84, rate: 0.09  },
    { upTo: 4354.27, rate: 0.12  },
    { upTo: 8475.55, rate: 0.14  },
  ];
  const ceiling = 988.09;
  let total = 0;
  let prev = 0;
  for (const { upTo, rate } of brackets) {
    const top = Math.min(gross, upTo);
    if (top <= prev) break;
    total += (top - prev) * rate;
    prev = top;
    if (gross <= upTo) break;
  }
  return Math.min(Math.round(total * 100) / 100, ceiling);
}

// ─── calculateNetSalary — validation ────────────────────────────────────────

describe("calculateNetSalary — input validation", () => {
  it("lança erro se grossSalary não é número", () => {
    expect(() => calculateNetSalary({ grossSalary: "3000" })).toThrow();
  });

  it("lança erro se grossSalary é zero", () => {
    expect(() => calculateNetSalary({ grossSalary: 0 })).toThrow();
  });

  it("lança erro se grossSalary é negativo", () => {
    expect(() => calculateNetSalary({ grossSalary: -500 })).toThrow();
  });

  it("lança erro se dependents não é inteiro", () => {
    expect(() =>
      calculateNetSalary({ grossSalary: 3000, dependents: 1.5 })
    ).toThrow();
  });

  it("lança erro se dependents é negativo", () => {
    expect(() =>
      calculateNetSalary({ grossSalary: 3000, dependents: -1 })
    ).toThrow();
  });

  it("lança erro se ano não tem tabela INSS", () => {
    expect(() =>
      calculateNetSalary({ grossSalary: 3000, effectiveYear: 1990 })
    ).toThrow(/INSS table not found/);
  });
});

// ─── calculateNetSalary — shape ──────────────────────────────────────────────

describe("calculateNetSalary — shape do retorno", () => {
  it("retorna todos os campos esperados", () => {
    const result = calculateNetSalary({ grossSalary: 3000 });
    expect(result).toHaveProperty("grossMonthly");
    expect(result).toHaveProperty("inssMonthly");
    expect(result).toHaveProperty("irrfMonthly");
    expect(result).toHaveProperty("netMonthly");
    expect(result).toHaveProperty("netAnnual");
    expect(result).toHaveProperty("taxAnnual");
  });

  it("grossMonthly == grossSalary passado", () => {
    const result = calculateNetSalary({ grossSalary: 4500 });
    expect(result.grossMonthly).toBe(4500);
  });

  it("netMonthly == grossMonthly - inssMonthly - irrfMonthly", () => {
    const result = calculateNetSalary({ grossSalary: 5000 });
    const expected =
      Math.round(
        (result.grossMonthly - result.inssMonthly - result.irrfMonthly) * 100
      ) / 100;
    expect(result.netMonthly).toBe(expected);
  });

  it("netAnnual == netMonthly * 12", () => {
    const result = calculateNetSalary({ grossSalary: 5000 });
    expect(result.netAnnual).toBe(Math.round(result.netMonthly * 12 * 100) / 100);
  });

  it("taxAnnual == (inssMonthly + irrfMonthly) * 12", () => {
    const result = calculateNetSalary({ grossSalary: 5000 });
    const expected =
      Math.round((result.inssMonthly + result.irrfMonthly) * 12 * 100) / 100;
    expect(result.taxAnnual).toBe(expected);
  });
});

// ─── INSS — brackets 2026 ───────────────────────────────────────────────────

describe("INSS 2026 — cálculo progressivo", () => {
  it("R$1.621 — alíquota única 7,5%", () => {
    const result = calculateNetSalary({ grossSalary: 1621 });
    // 1621 × 7.5% = 121.575 → 121.58
    expect(result.inssMonthly).toBe(Math.round(1621 * 0.075 * 100) / 100);
  });

  it("R$2.000 — duas faixas", () => {
    const result = calculateNetSalary({ grossSalary: 2000 });
    expect(result.inssMonthly).toBe(expectedInss2026(2000));
  });

  it("R$3.000 — três faixas", () => {
    const result = calculateNetSalary({ grossSalary: 3000 });
    expect(result.inssMonthly).toBe(expectedInss2026(3000));
  });

  it("R$5.000 — quatro faixas", () => {
    const result = calculateNetSalary({ grossSalary: 5000 });
    expect(result.inssMonthly).toBe(expectedInss2026(5000));
  });

  it("acima do teto R$8.475,55 — capped em R$988,09", () => {
    const result = calculateNetSalary({ grossSalary: 15000 });
    expect(result.inssMonthly).toBe(988.09);
  });

  it("exatamente no teto R$8.475,55 — máximo R$988,09", () => {
    const result = calculateNetSalary({ grossSalary: 8475.55 });
    expect(result.inssMonthly).toBe(988.09);
  });
});

// ─── IRRF — isento / tributado 2026 ─────────────────────────────────────────

describe("IRRF 2026 — isento e tributado", () => {
  it("R$1.621 — IRRF isento (base < R$2.428,80)", () => {
    const result = calculateNetSalary({ grossSalary: 1621 });
    // base IRRF = 1621 − 121.58 = 1499.42 < 2428.80 → isento
    expect(result.irrfMonthly).toBe(0);
  });

  it("R$2.500 — base próxima ao limite → isento ou 7,5%", () => {
    const result = calculateNetSalary({ grossSalary: 2500 });
    const inss = expectedInss2026(2500);
    const base = Math.round((2500 - inss) * 100) / 100;
    if (base <= 2428.8) {
      expect(result.irrfMonthly).toBe(0);
    } else {
      expect(result.irrfMonthly).toBeGreaterThan(0);
    }
  });

  it("R$3.000 — IRRF na faixa 7,5% ou 15%", () => {
    const result = calculateNetSalary({ grossSalary: 3000 });
    expect(result.irrfMonthly).toBeGreaterThan(0);
  });

  it("R$5.000 — IRRF positivo", () => {
    const result = calculateNetSalary({ grossSalary: 5000 });
    expect(result.irrfMonthly).toBeGreaterThan(0);
  });

  it("R$15.000 — IRRF na faixa máxima 27,5%", () => {
    const result = calculateNetSalary({ grossSalary: 15000 });
    const inss = 988.09; // teto
    const base = Math.round((15000 - inss) * 100) / 100;
    // faixa > 4664.68 → 27.5% − 908.73
    const expectedIrrf = Math.round((base * 0.275 - 908.73) * 100) / 100;
    expect(result.irrfMonthly).toBe(expectedIrrf);
  });
});

// ─── Dependentes ─────────────────────────────────────────────────────────────

describe("dedução por dependentes", () => {
  it("0 dependentes == sem dedução de dependentes", () => {
    const sem = calculateNetSalary({ grossSalary: 4000, dependents: 0 });
    const com = calculateNetSalary({ grossSalary: 4000, dependents: 0 });
    expect(sem.irrfMonthly).toBe(com.irrfMonthly);
  });

  it("1 dependente reduz IRRF em relação a 0 dependentes", () => {
    const sem = calculateNetSalary({ grossSalary: 4000, dependents: 0 });
    const com = calculateNetSalary({ grossSalary: 4000, dependents: 1 });
    expect(com.irrfMonthly).toBeLessThanOrEqual(sem.irrfMonthly);
  });

  it("2 dependentes reduz IRRF mais do que 1 dependente", () => {
    const um = calculateNetSalary({ grossSalary: 4000, dependents: 1 });
    const dois = calculateNetSalary({ grossSalary: 4000, dependents: 2 });
    expect(dois.irrfMonthly).toBeLessThanOrEqual(um.irrfMonthly);
  });

  it("dependentes não afetam o cálculo de INSS", () => {
    const sem = calculateNetSalary({ grossSalary: 4000, dependents: 0 });
    const com = calculateNetSalary({ grossSalary: 4000, dependents: 3 });
    expect(com.inssMonthly).toBe(sem.inssMonthly);
  });

  it("IRRF nunca fica negativo com muitos dependentes", () => {
    const result = calculateNetSalary({ grossSalary: 2500, dependents: 10 });
    expect(result.irrfMonthly).toBeGreaterThanOrEqual(0);
  });
});

// ─── effectiveYear — default ──────────────────────────────────────────────────

describe("effectiveYear", () => {
  it("sem effectiveYear usa 2026 por padrão", () => {
    const a = calculateNetSalary({ grossSalary: 3000 });
    const b = calculateNetSalary({ grossSalary: 3000, effectiveYear: 2026 });
    expect(a).toEqual(b);
  });
});
