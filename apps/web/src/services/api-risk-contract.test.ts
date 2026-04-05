import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  api,
  getApiHealth,
  resolveApiUrl,
  setPaymentRequiredHandler,
  setUnauthorizedHandler,
  type PaymentRequiredPayload,
} from "./api";

type ApiErrorInput = {
  response?: {
    status?: number;
    data?: {
      message?: string;
      code?: string;
    };
  };
  config?: {
    url?: string;
    headers?: Record<string, unknown>;
    _retry?: boolean;
  };
};

type RequestConfigInput = {
  headers?: Record<string, unknown>;
};

type RequestInterceptor = (config: RequestConfigInput) => RequestConfigInput;
type ResponseErrorInterceptor = (error: ApiErrorInput) => Promise<unknown>;

type MockAxiosInstance = {
  get: Mock;
  post: Mock;
  request: Mock;
  interceptors: {
    request: {
      use: Mock;
    };
    response: {
      use: Mock;
    };
  };
};

const interceptorState = vi.hoisted(() => ({
  requestInterceptor: null as RequestInterceptor | null,
  responseErrorInterceptor: null as ResponseErrorInterceptor | null,
}));

const requireRequestInterceptor = (): RequestInterceptor => {
  if (!interceptorState.requestInterceptor) {
    throw new Error("request interceptor nao inicializado");
  }

  return interceptorState.requestInterceptor;
};

const requireResponseErrorInterceptor = (): ResponseErrorInterceptor => {
  if (!interceptorState.responseErrorInterceptor) {
    throw new Error("response interceptor nao inicializado");
  }

  return interceptorState.responseErrorInterceptor;
};

vi.mock("axios", () => {
  const instance: MockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((handler: RequestInterceptor) => {
          interceptorState.requestInterceptor = handler;
          return 0;
        }),
      },
      response: {
        use: vi.fn((_onSuccess: unknown, onError: ResponseErrorInterceptor) => {
          interceptorState.responseErrorInterceptor = onError;
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

const apiMock = api as unknown as Pick<MockAxiosInstance, "get" | "post" | "request">;

describe("api risk contract", () => {
  beforeEach(() => {
    setUnauthorizedHandler(undefined);
    setPaymentRequiredHandler(undefined);
    vi.clearAllMocks();
  });

  it("consulta o healthcheck da API", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { ok: true, version: "1.6.4", commit: "2eb3f64" },
    });

    const result = await getApiHealth();

    expect(apiMock.get).toHaveBeenCalledWith("/health");
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
    const nextConfig = requireRequestInterceptor()({
      headers: {},
    });

    const headers = (nextConfig.headers || {}) as Record<string, unknown>;
    expect(headers.Authorization).toBeUndefined();
    expect(typeof headers["x-request-id"]).toBe("string");
    expect(String(headers["x-request-id"]).length).toBeGreaterThan(0);
  });

  it("tenta refresh e retenta request quando API retorna 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    apiMock.post.mockResolvedValueOnce({});
    apiMock.request.mockResolvedValueOnce({ data: "retried" });

    const result = await requireResponseErrorInterceptor()({
      response: { status: 401 },
      config: { url: "/transactions", headers: {} },
    });

    expect(apiMock.post).toHaveBeenCalledWith("/auth/refresh");
    expect(apiMock.request).toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result).toEqual({ data: "retried" });
  });

  it("executa unauthorizedHandler quando refresh falha em 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    apiMock.post.mockRejectedValueOnce(new Error("refresh failed"));

    await expect(
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/transactions", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao tenta refresh quando 401 vem da rota de refresh", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/auth/refresh", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao tenta refresh quando request ja foi retentado", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/transactions", headers: {}, _retry: true },
      }),
    ).rejects.toBeTruthy();

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("nao executa unauthorizedHandler se ele for removido", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setUnauthorizedHandler(undefined);

    apiMock.post.mockRejectedValueOnce(new Error("refresh failed"));

    await expect(
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/transactions", headers: {} },
      }),
    ).rejects.toBeTruthy();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("dois requests 401 simultaneos disparam apenas um refresh", async () => {
    apiMock.post.mockResolvedValueOnce({});
    apiMock.request
      .mockResolvedValueOnce({ data: "response-1" })
      .mockResolvedValueOnce({ data: "response-2" });

    const [r1, r2] = await Promise.all([
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/summary", headers: {} },
      }),
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/forecast", headers: {} },
      }),
    ]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith("/auth/refresh");
    expect(apiMock.request).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ data: "response-1" });
    expect(r2).toEqual({ data: "response-2" });
  });

  it("rejeita requests na fila quando refresh falha durante concorrencia", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    apiMock.post.mockRejectedValueOnce(new Error("refresh failed"));

    const results = await Promise.allSettled([
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/summary", headers: {} },
      }),
      requireResponseErrorInterceptor()({
        response: { status: 401 },
        config: { url: "/forecast", headers: {} },
      }),
    ]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("chama paymentRequiredHandler com contexto trial_expired quando code=TRIAL_EXPIRED", async () => {
    const onPaymentRequired = vi.fn<(payload: PaymentRequiredPayload) => void>();
    setPaymentRequiredHandler(onPaymentRequired);

    await expect(
      requireResponseErrorInterceptor()({
        response: {
          status: 402,
          data: { message: "Periodo de teste encerrado.", code: "TRIAL_EXPIRED" },
        },
      }),
    ).rejects.toBeTruthy();

    expect(onPaymentRequired).toHaveBeenCalledWith({
      reason: "Periodo de teste encerrado.",
      feature: "unknown",
      context: "trial_expired",
    });
  });

  it("resolve copy explicita para gate de importacao de extrato", async () => {
    const onPaymentRequired = vi.fn<(payload: PaymentRequiredPayload) => void>();
    setPaymentRequiredHandler(onPaymentRequired);

    await expect(
      requireResponseErrorInterceptor()({
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

  it("nao falha se paymentRequiredHandler nao estiver definido", async () => {
    await expect(
      requireResponseErrorInterceptor()({
        response: { status: 402, data: {} },
      }),
    ).rejects.toBeTruthy();
  });
});
