import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import type { ApiHealth } from "./types";

const API_URL_LOCAL_DEV = "http://localhost:3001";
const API_CONFIGURATION_ERROR_MESSAGE =
  "VITE_API_URL nao configurada para este ambiente. Defina a variavel no deploy.";

type EnvConfig = {
  DEV?: boolean;
  VITE_API_URL?: string;
};

type UnauthorizedHandler = (() => void) | undefined;
type PaymentRequiredHandler = ((message: string) => void) | undefined;

type ApiConfigurationError = Error & {
  code: "API_URL_NOT_CONFIGURED";
};

type QueueEntry = { resolve: () => void; reject: (err: unknown) => void };

export const resolveApiUrl = (env: EnvConfig = import.meta.env) => {
  const configuredApiUrl = env?.VITE_API_URL?.trim();

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (env?.DEV) {
    return API_URL_LOCAL_DEV;
  }

  return "";
};

const API_URL = resolveApiUrl();
const REQUEST_ID_HEADER_NAME = "x-request-id";
const isApiConfigured = Boolean(API_URL);
let unauthorizedHandler: UnauthorizedHandler = undefined;
let paymentRequiredHandler: PaymentRequiredHandler = undefined;
let isRefreshing = false;
let pendingQueue: QueueEntry[] = [];

const createApiConfigurationError = (): ApiConfigurationError => {
  const error = new Error(API_CONFIGURATION_ERROR_MESSAGE) as ApiConfigurationError;
  error.code = "API_URL_NOT_CONFIGURED";
  return error;
};

const createRequestId = () => {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const setRequestHeader = (
  config: InternalAxiosRequestConfig,
  headerName: string,
  headerValue: string,
) => {
  const mutableConfig = config as InternalAxiosRequestConfig & {
    headers: {
      set?: (name: string, value: string) => void;
      [key: string]: unknown;
    };
  };

  if (mutableConfig.headers && typeof mutableConfig.headers.set === "function") {
    mutableConfig.headers.set(headerName, headerValue);
    return;
  }

  const headersRecord =
    mutableConfig.headers && typeof mutableConfig.headers === "object"
      ? (mutableConfig.headers as Record<string, unknown>)
      : {};

  mutableConfig.headers = {
    ...headersRecord,
    [headerName]: headerValue,
  } as unknown as InternalAxiosRequestConfig["headers"];
};

const resolveErrorRequestId = (error: unknown) => {
  const errorLike = error as {
    response?: {
      headers?: Record<string, unknown>;
      data?: { requestId?: unknown };
    };
    config?: {
      headers?: Record<string, unknown>;
    };
  };

  const requestIdFromResponseHeader =
    typeof errorLike?.response?.headers?.[REQUEST_ID_HEADER_NAME] === "string"
      ? String(errorLike.response.headers[REQUEST_ID_HEADER_NAME]).trim()
      : "";

  if (requestIdFromResponseHeader) {
    return requestIdFromResponseHeader;
  }

  const requestIdFromBody =
    typeof errorLike?.response?.data?.requestId === "string"
      ? errorLike.response.data.requestId.trim()
      : "";

  if (requestIdFromBody) {
    return requestIdFromBody;
  }

  const requestIdFromRequestHeader =
    typeof errorLike?.config?.headers?.[REQUEST_ID_HEADER_NAME] === "string"
      ? String(errorLike.config.headers[REQUEST_ID_HEADER_NAME]).trim()
      : "";

  if (requestIdFromRequestHeader) {
    return requestIdFromRequestHeader;
  }

  return "";
};

const shouldLogApiErrors = () => import.meta.env?.MODE !== "test";

const drainQueue = (error?: unknown) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  pendingQueue = [];
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  unauthorizedHandler = typeof handler === "function" ? handler : undefined;
};

export const setPaymentRequiredHandler = (handler: PaymentRequiredHandler) => {
  paymentRequiredHandler = typeof handler === "function" ? handler : undefined;
};

export const api = axios.create({
  baseURL: API_URL || undefined,
  timeout: 8000,
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!isApiConfigured) {
    return Promise.reject(createApiConfigurationError());
  }

  setRequestHeader(config, REQUEST_ID_HEADER_NAME, createRequestId());

  return config;
});

const PAYWALL_COPY: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\/transactions\/import/,
    reason: "Importe transações de outros apps e bancos direto para o Control Finance.",
  },
  {
    pattern: /\/transactions\/export/,
    reason: "Exporte suas transações para planilhas e ferramentas financeiras.",
  },
  {
    pattern: /\/forecasts/,
    reason: "Saiba exatamente quanto vai ter no saldo no fim do mês.",
  },
  {
    pattern: /\/analytics\/trend/,
    reason: "Acesse até 24 meses de histórico e veja sua evolução financeira completa.",
  },
  {
    pattern: /\/salary/,
    reason: "Planeje seu salário com cálculo real de INSS e IRRF.",
  },
];

const isTrialExpiredMessage = (msg: string): boolean =>
  msg.toLowerCase().includes("teste encerrado");

const resolvePaywallReason = (url: string, serverMessage: string): string => {
  if (isTrialExpiredMessage(serverMessage)) {
    return serverMessage;
  }

  for (const entry of PAYWALL_COPY) {
    if (entry.pattern.test(url)) {
      return entry.reason;
    }
  }

  return serverMessage;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestId = resolveErrorRequestId(error);

    if (requestId && shouldLogApiErrors()) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "web.api.request.error",
          requestId,
        }),
      );
    }

    if (error?.response?.status === 401) {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      const isRefreshEndpoint =
        typeof originalRequest?.url === "string" &&
        originalRequest.url.includes("/auth/refresh");

      if (isRefreshEndpoint || originalRequest?._retry) {
        drainQueue(error);
        if (typeof unauthorizedHandler === "function") {
          unauthorizedHandler();
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        })
          .then(() => api.request(originalRequest))
          .catch(() => Promise.reject(error));
      }

      isRefreshing = true;
      originalRequest._retry = true;

      try {
        await api.post("/auth/refresh");
        drainQueue();
        return api.request(originalRequest);
      } catch (refreshError) {
        drainQueue(refreshError);
        if (typeof unauthorizedHandler === "function") {
          unauthorizedHandler();
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    if (error?.response?.status === 402) {
      const serverMessage: string =
        typeof error?.response?.data?.message === "string"
          ? error.response.data.message
          : "";

      const url: string = error?.config?.url ?? "";
      const reason = resolvePaywallReason(url, serverMessage);

      if (typeof paymentRequiredHandler === "function") {
        paymentRequiredHandler(reason);
      }
    }

    return Promise.reject(error);
  },
);

export const getApiHealth = async (): Promise<ApiHealth> => {
  const { data } = await api.get("/health");
  return data as ApiHealth;
};
