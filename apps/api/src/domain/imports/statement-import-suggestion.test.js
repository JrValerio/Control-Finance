import { describe, expect, it } from "vitest";
import {
  extractInssSuggestion,
  extractInssSuggestions,
  extractEnergyBillSuggestion,
  extractWaterBillSuggestion,
  extractTelecomBillSuggestion,
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

const INSS_MULTI_COMPETENCE_SAMPLE = `
INSS - Instituto Nacional do Seguro Social
Historico de Creditos

NB: 177.682.989-9
Espécie: 21 - PENSÃO POR MORTE PREVIDENCIÁRIA
CPF: 433.427.604-00
Data de nascimento: 07/01/1955

02/2026  R$ 2.803,52
Crédito não retornado 05/03/2026
101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67
216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 156,00
216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 90,30
217 EMPRESTIMO SOBRE A RMC R$ 238,00
268 CONSIGNACAO - CARTAO R$ 247,93

03/2026  R$ 2.803,52
Credito nao retornado 07/04/2026
101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67
216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 75,17
216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 425,10
268 CONSIGNACAO - CARTAO R$ 247,93
`.trim();

const INSS_WITH_STANDALONE_PAYMENT_LINE = `
INSS - Instituto Nacional do Seguro Social
Historico de Creditos
NB: 177.682.989-9

03/2026  R$ 2.803,52 CCF - CONTA-CORRENTE Não Não 01/03/2026
a
31/03/2026
07/04/2026
Banco: 341 - ITAU OP: 741159 - ATIBAIA AV DNA GERTRUDES Ocorrência: Crédito não retornado
Data Cálculo: 09/03/2026 Origem: Maciça Validade Início: 07/04/2026 Fim: 29/05/2026
101 VALOR TOTAL DE MR DO PERIODO R$ 4.958,67
268 CONSIGNACAO - CARTAO R$ 247,93
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
    expect(result.deductions[0]).toMatchObject({
      code: "216",
      label: "EMPRESTIMO CONSIGNADO",
      amount: 1200,
      consignacaoType: "loan",
    });
    expect(result.deductions[1]).toMatchObject({
      code: "268",
      label: "CARTAO RMC",
      amount: 955.15,
      consignacaoType: "card",
    });
  });

  it("retorna deductions vazio quando nao ha rubricas de desconto", () => {
    const result = extractInssSuggestion(INSS_WITHOUT_GROSS);
    expect(result.deductions).toEqual([]);
  });

  it("gera uma sugestao por competencia com data de pagamento correta", () => {
    const result = extractInssSuggestions(INSS_MULTI_COMPETENCE_SAMPLE);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      line: 7,
      referenceMonth: "2026-02",
      paymentDate: "2026-03-05",
      netAmount: 2803.52,
      grossAmount: 4958.67,
      taxpayerCpf: "433.427.604-00",
      birthYear: 1955,
    });
    expect(result[1]).toMatchObject({
      line: 14,
      referenceMonth: "2026-03",
      paymentDate: "2026-04-07",
      netAmount: 2803.52,
      grossAmount: 4958.67,
    });
    expect(result[0].deductions).toEqual([
      expect.objectContaining({
        code: "216",
        label: "CONSIGNACAO EMPRESTIMO BANCARIO",
        amount: 156,
        consignacaoType: "loan",
      }),
      expect.objectContaining({
        code: "216",
        label: "CONSIGNACAO EMPRESTIMO BANCARIO",
        amount: 90.3,
        consignacaoType: "loan",
      }),
      expect.objectContaining({
        code: "217",
        label: "EMPRESTIMO SOBRE A RMC",
        amount: 238,
        consignacaoType: "loan",
      }),
      expect.objectContaining({
        code: "268",
        label: "CONSIGNACAO - CARTAO",
        amount: 247.93,
        consignacaoType: "card",
      }),
    ]);
  });

  it("prefere a linha isolada da data de pagamento ao inves da data de calculo", () => {
    const [result] = extractInssSuggestions(INSS_WITH_STANDALONE_PAYMENT_LINE);

    expect(result).toMatchObject({
      referenceMonth: "2026-03",
      paymentDate: "2026-04-07",
      netAmount: 2803.52,
    });
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
    expect(result.referenceMonth).toBe("2025-12");
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
    expect(result.referenceMonth).toBe("2026-03");
  });

  it("tolera labels abreviados de referencia, vencimento e valor", () => {
    const text = "ENEL\nRef.: 3/2026\nVenc.: 05/04/2026\nValor do documento R$ 199,90";
    const result = extractEnergyBillSuggestion(text);
    expect(result).not.toBeNull();
    expect(result.referenceMonth).toBe("2026-03");
    expect(result.dueDate).toBe("2026-04-05");
    expect(result.amountDue).toBeCloseTo(199.9);
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
    expect(result.referenceMonth).toBe("2026-02");
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

  it("aceita referencia com mes abreviado e total com impostos", () => {
    const text = "SABESP\nRef.: mar./2026\nData de vencimento: 12/04/2026\nTotal com impostos R$ 88,71";
    const result = extractWaterBillSuggestion(text);
    expect(result).not.toBeNull();
    expect(result.referenceMonth).toBe("2026-03");
    expect(result.dueDate).toBe("2026-04-12");
    expect(result.amountDue).toBeCloseTo(88.71);
  });
});

// ---------------------------------------------------------------------------
// extractTelecomBillSuggestion
// ---------------------------------------------------------------------------

const TELECOM_INTERNET_SAMPLE = `
VIVO FIBRA
Codigo do cliente: 1234567
Referência: 03/2026
Vencimento: 15/04/2026
TOTAL A PAGAR R$ 129,90
`.trim();

const TELECOM_PHONE_SAMPLE = `
TIM
Numero da linha: (11) 99999-9999
Ref.: abr./2026
Data de vencimento: 22/05/2026
Valor do documento R$ 89,50
Servico Movel Pessoal
`.trim();

const TELECOM_TV_SAMPLE = `
SKY
Assinatura TV
Contrato: 887766
Referência: 05/2026
Vencimento: 10/06/2026
Total com impostos R$ 159,00
`.trim();

const TELECOM_NO_FIELDS = `
Documento telecom sem dados de cobranca.
`.trim();

describe("extractTelecomBillSuggestion", () => {
  it("retorna null quando nenhum campo relevante esta presente", () => {
    expect(extractTelecomBillSuggestion(TELECOM_NO_FIELDS)).toBeNull();
  });

  it("extrai billType=internet quando sinais de internet estao presentes", () => {
    const result = extractTelecomBillSuggestion(TELECOM_INTERNET_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.type).toBe("bill");
    expect(result.billType).toBe("internet");
    expect(result.issuer).toBe("vivo");
    expect(result.referenceMonth).toBe("2026-03");
    expect(result.dueDate).toBe("2026-04-15");
    expect(result.amountDue).toBeCloseTo(129.9);
    expect(result.customerCode).toMatch(/1234567/);
  });

  it("extrai billType=phone quando sinais de telefonia estao presentes", () => {
    const result = extractTelecomBillSuggestion(TELECOM_PHONE_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.billType).toBe("phone");
    expect(result.issuer).toBe("tim");
    expect(result.referenceMonth).toBe("2026-04");
    expect(result.dueDate).toBe("2026-05-22");
    expect(result.amountDue).toBeCloseTo(89.5);
    expect(result.customerCode).toMatch(/99999/);
  });

  it("extrai billType=tv quando sinais de TV por assinatura estao presentes", () => {
    const result = extractTelecomBillSuggestion(TELECOM_TV_SAMPLE);
    expect(result).not.toBeNull();
    expect(result.billType).toBe("tv");
    expect(result.issuer).toBe("sky");
    expect(result.referenceMonth).toBe("2026-05");
    expect(result.dueDate).toBe("2026-06-10");
    expect(result.amountDue).toBeCloseTo(159);
    expect(result.customerCode).toBe("887766");
  });
});
