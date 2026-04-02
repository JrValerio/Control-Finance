import { describe, expect, it } from "vitest";
import { resolvePaywallPayload } from "./api";

describe("resolvePaywallPayload", () => {
  it("classifica trial_expired apenas pelo codigo estruturado", () => {
    const payload = resolvePaywallPayload(
      "/forecasts/current",
      "Mensagem qualquer sem palavra-chave",
      "TRIAL_EXPIRED",
    );

    expect(payload).toEqual({
      reason: "Mensagem qualquer sem palavra-chave",
      feature: "unknown",
      context: "trial_expired",
    });
  });

  it("nao usa fallback por texto para trial_expired", () => {
    const payload = resolvePaywallPayload(
      "/forecasts/current",
      "Periodo de teste encerrado. Ative seu plano.",
      "",
    );

    expect(payload.context).toBe("feature_gate");
    expect(payload.feature).toBe("forecast");
    expect(payload.reason).toMatch(/A projeção do mês é um recurso do Pro/i);
  });

  it("mantem fallback de feature unknown quando rota nao mapeada", () => {
    const payload = resolvePaywallPayload(
      "/qualquer/rota",
      "Pagamento necessário.",
      "FEATURE_DISABLED",
    );

    expect(payload).toEqual({
      reason: "Pagamento necessário.",
      feature: "unknown",
      context: "feature_gate",
    });
  });
});
