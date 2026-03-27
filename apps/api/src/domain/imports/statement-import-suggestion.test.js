import { describe, expect, it } from "vitest";
import {
  extractInssSuggestion,
  extractEnergyBillSuggestion,
  extractWaterBillSuggestion,
} from "./statement-import.js";

// ---------------------------------------------------------------------------
// extractInssSuggestion
// ---------------------------------------------------------------------------

const INSS_SAMPLE = `
INSS - Instituto Nacional do Seguro Social
Histórico de Créditos

NB: 177.682.989-9
Espécie: 21 - PENSÃO POR MORTE PREVIDENCIÁRIA

03/2026  R$ 2.803,52
07/04/2026
101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67
216 EMPRESTIMO CONSIGNADO R$ 1.200,00
268 CARTAO RMC R$ 955,15
`.trim();

const INSS_WITHOUT_GROSS = `
INSS - Instituto Nacional do Seguro Social
NB 42.123.456-0
Espécie: 32 - APOSENTADORIA POR TEMPO DE CONTRIBUICAO

02/2026  R$ 1.500,00
05/03/2026
`.trim();

describe("extractInssSuggestion", () => {
  it("retorna null quando o texto nao tem entrada de credito", () => {
    expect(extractInssSuggestion("texto qualquer sem creditos")).toBeNull();
  });

  it("extrai netAmount e referenceMonth da entrada mais recente", () => {
    const result = extractInssSuggestion(INSS_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.type).toBe("profile");
    expect(result.referenceMonth).toBe("2026-03");
    expect(result.netAmount).toBeCloseTo(2803.52);
  });

  it("extrai grossAmount da rubrica 101", () => {
    const result = extractInssSuggestion(INSS_SAMPLE);
    expect(result.grossAmount).toBeCloseTo(4958.67);
  });

  it("extrai paymentDate como ISO quando disponivel", () => {
    const result = extractInssSuggestion(INSS_SAMPLE);
    expect(result.paymentDate).toBe("2026-04-07");
  });

  it("extrai benefitId e benefitKind", () => {
    const result = extractInssSuggestion(INSS_SAMPLE);
    expect(result.benefitId).toMatch(/177/);
    expect(result.benefitKind).toMatch(/pensao por morte/i);
  });

  it("retorna grossAmount null quando rubrica 101 ausente", () => {
    const result = extractInssSuggestion(INSS_WITHOUT_GROSS);
    expect(result).not.toBeNull();
    expect(result.grossAmount).toBeNull();
    expect(result.netAmount).toBeCloseTo(1500.0);
  });

  it("tolera NB sem pontuacao", () => {
    const result = extractInssSuggestion(INSS_WITHOUT_GROSS);
    expect(result.benefitId).toMatch(/42/);
  });

  it("extrai deductions estruturadas das rubricas 216 e 268", () => {
    const result = extractInssSuggestion(INSS_SAMPLE);
    expect(Array.isArray(result.deductions)).toBe(true);
    expect(result.deductions).toHaveLength(2);
    expect(result.deductions[0]).toMatchObject({ label: "emprestimo_consignado", amount: 1200 });
    expect(result.deductions[1]).toMatchObject({ label: "cartao_rmc", amount: 955.15 });
  });

  it("retorna deductions vazio quando nao ha rubricas de desconto", () => {
    const result = extractInssSuggestion(INSS_WITHOUT_GROSS);
    expect(result.deductions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractEnergyBillSuggestion
// ---------------------------------------------------------------------------

const ENERGY_SAMPLE = `
Neoenergia Elektro Distribuição S.A.
NOTA FISCAL / CONTA DE ENERGIA ELÉTRICA

Código de Instalação: 41864557
Referência: Dezembro/2025
Vencimento: 21/01/2026
TOTAL A PAGAR R$ 412,00
`.trim();

const ENERGY_NO_FIELDS = `
Documento qualquer sem campos de boleto de energia.
`.trim();

describe("extractEnergyBillSuggestion", () => {
  it("retorna null quando nenhum campo relevante esta presente", () => {
    expect(extractEnergyBillSuggestion(ENERGY_NO_FIELDS)).toBeNull();
  });

  it("retorna type=bill e billType=energy", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.type).toBe("bill");
    expect(result.billType).toBe("energy");
  });

  it("extrai issuer da lista de distribuidoras conhecidas", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result.issuer).toMatch(/neoenergia/);
  });

  it("resolve referenceMonth para MM/AAAA a partir de nome de mes", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result.referenceMonth).toBe("12/2025");
  });

  it("extrai dueDate como ISO", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result.dueDate).toBe("2026-01-21");
  });

  it("extrai amountDue", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result.amountDue).toBeCloseTo(412.0);
  });

  it("extrai customerCode", () => {
    const result = extractEnergyBillSuggestion(ENERGY_SAMPLE);
    expect(result.customerCode).toBe("41864557");
  });

  it("aceita referenceMonth numerico MM/AAAA", () => {
    const text = "CPFL Energia\nReferência: 03/2026\nVencimento: 10/04/2026\nTOTAL A PAGAR R$ 300,00";
    const result = extractEnergyBillSuggestion(text);
    expect(result.referenceMonth).toBe("03/2026");
  });
});

// ---------------------------------------------------------------------------
// extractWaterBillSuggestion
// ---------------------------------------------------------------------------

const WATER_SAMPLE = `
SAAE - Serviço Autônomo de Água e Esgoto de Atibaia
Matrícula: 62092-0
Referência: 02/2026
Vencimento: 28/03/2026
TOTAL A PAGAR R$ 403,88
`.trim();

const WATER_NO_FIELDS = `
Documento qualquer sem campos de boleto de agua.
`.trim();

describe("extractWaterBillSuggestion", () => {
  it("retorna null quando nenhum campo relevante esta presente", () => {
    expect(extractWaterBillSuggestion(WATER_NO_FIELDS)).toBeNull();
  });

  it("retorna type=bill e billType=water", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.type).toBe("bill");
    expect(result.billType).toBe("water");
  });

  it("extrai issuer da lista de prestadoras conhecidas", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result.issuer).toMatch(/saae/);
  });

  it("resolve referenceMonth MM/AAAA numerico", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result.referenceMonth).toBe("02/2026");
  });

  it("extrai dueDate como ISO", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result.dueDate).toBe("2026-03-28");
  });

  it("extrai amountDue", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result.amountDue).toBeCloseTo(403.88);
  });

  it("extrai customerCode da matricula", () => {
    const result = extractWaterBillSuggestion(WATER_SAMPLE);
    expect(result.customerCode).toMatch(/62092/);
  });
});
