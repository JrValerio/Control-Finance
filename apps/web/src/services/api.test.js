import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  getApiHealth,
  resolveApiUrl,
  setUnauthorizedHandler,
  setPaymentRequiredHandler,
} from "./api";

var requestInterceptor;
var responseErrorInterceptor;

vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((handler) => {
          requestInterceptor = handler;
          return 0;
        }),
      },
      response: {
        use: vi.fn((_onSuccess, onError) => {
          responseErrorInterceptor = onError;
          return 0;
        }),
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

describe("api service", () => {
  beforeEach(() => {
    setUnauthorizedHandler(undefined);
    setPaymentRequiredHandler(undefined);
    vi.clearAllMocks();
  });

  it("consulta o healthcheck da API", async () => {
    api.get.mockResolvedValueOnce({
      data: { ok: true, version: "1.6.4", commit: "2eb3f64" },
    });

    const result = await getApiHealth();

    expect(api.get).toHaveBeenCalledWith("/health");
    expect(result).toEqual({ ok: true, version: "1.6.4", commit: "2eb3f64" });
  });

  it("resolve URL configurada para producao", () => {
    const url = resolveApiUrl({
      DEV: false,
      VITE_API_URL: "https://control-finance-api.example.com",
    });

    expect(url).toBe("https://control-finance-api.example.com");
  });

  it("nao usa localhost em producao sem VITE_API_URL", () => {
    const url = resolveApiUrl({
      DEV: false,
      VITE_API_URL: "",
    });

    expect(url).toBe("");
  });

  it("injeta x-request-id em todas as requisicoes", () => {
    const nextConfig = requestInterceptor({
      headers: {},
    });

    expect(nextConfig.headers.Authorization).toBeUndefined();
    expect(typeof nextConfig.headers["x-request-id"]).toBe("string");
    expect(nextConfig.headers["x-request-id"].length).toBeGreaterThan(0);
  });

  // ─── 401 / Refresh interceptor ───────────────────────────────────────────────

  it("tenta refresh e retenta request quando API retorna 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    api.post.mockResolvedValueOnce({}); // refresh succeeds
    api.request.mockResolvedValueOnce({ data: "retried" }); // original request retried

    const result = await responseErrorInterceptor({
      response: { status: 401 },
      config: { url: "/transactions", headers: {} },
    });

    expect(api.post).toHaveBeenCalledWith("/auth/refresh");
    expect(api.request).toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result).toEqual({ data: "retried" });
  });

  it("executa unauthorizedHandler quando refresh falha em 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    api.post.mockRejectedValueOnce(new Error("refresh failed"));

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/transactions", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao tenta refresh quando 401 vem da rota de refresh (evita loop)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/auth/refresh", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(api.post).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao tenta refresh quando request ja foi retentado (_retry=true)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/transactions", headers: {}, _retry: true },
      }),
    ).rejects.toBeTruthy();

    expect(api.post).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao executa unauthorizedHandler se ele for removido", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setUnauthorizedHandler(undefined);

    api.post.mockRejectedValueOnce(new Error("refresh failed"));

    await expect(
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/transactions", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // ─── Concurrent 401 / refresh queue ─────────────────────────────────────────

  it("dois requests 401 simultaneos disparam apenas um refresh e ambos retentam", async () => {
    api.post.mockResolvedValueOnce({}); // refresh succeeds
    api.request
      .mockResolvedValueOnce({ data: "response-1" })
      .mockResolvedValueOnce({ data: "response-2" });

    const [r1, r2] = await Promise.all([
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/summary", headers: {} },
      }),
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/forecast", headers: {} },
      }),
    ]);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/refresh");
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ data: "response-1" });
    expect(r2).toEqual({ data: "response-2" });
  });

  it("rejeita requests na fila quando refresh falha durante concorrencia", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    api.post.mockRejectedValueOnce(new Error("refresh failed"));

    const results = await Promise.allSettled([
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/summary", headers: {} },
      }),
      responseErrorInterceptor({
        response: { status: 401 },
        config: { url: "/forecast", headers: {} },
      }),
    ]);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
    // unauthorizedHandler fired once — from the first request's catch block only
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  // ─── 402 handler ─────────────────────────────────────────────────────────────

  it("chama paymentRequiredHandler com a mensagem quando status e 402", async () => {
    const onPaymentRequired = vi.fn();
    setPaymentRequiredHandler(onPaymentRequired);

    await expect(
      responseErrorInterceptor({
        response: { status: 402, data: { message: "Periodo de teste encerrado." } },
      }),
    ).rejects.toBeTruthy();

    expect(onPaymentRequired).toHaveBeenCalledWith({
      reason: "Periodo de teste encerrado.",
      feature: "unknown",
      context: "trial_expired",
    });
  });

  it("resolve copy explicita para gate de importacao de extrato", async () => {
    const onPaymentRequired = vi.fn();
    setPaymentRequiredHandler(onPaymentRequired);

    await expect(
      responseErrorInterceptor({
        response: { status: 402, data: { message: "Recurso disponivel apenas no plano Pro." } },
        config: { url: "/transactions/import/dry-run" },
      }),
    ).rejects.toBeTruthy();

    expect(onPaymentRequired).toHaveBeenCalledWith({
      reason:
        "Importação de extratos é um recurso do Pro. No Pro, você importa CSV, OFX e PDF com prévia antes de confirmar.",
      feature: "csv_import",
      context: "feature_gate",
    });
  });

  it("nao falha se paymentRequiredHandler nao estiver definido (status 402)", async () => {
    await expect(
      responseErrorInterceptor({
        response: { status: 402, data: {} },
      }),
    ).rejects.toBeTruthy();
    // nenhum erro de "is not a function"
  });
});
