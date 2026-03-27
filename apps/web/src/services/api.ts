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

import type { PaywallFeature, PaywallContext } from "../utils/analytics";

type UnauthorizedHandler = (() => void) | undefined;
export type PaymentRequiredPayload = { reason: string; feature: PaywallFeature; context: PaywallContext };
type PaymentRequiredHandler = ((payload: PaymentRequiredPayload) => void) | undefined;

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

const PAYWALL_COPY: Array<{ pattern: RegExp; reason: string; feature: PaywallFeature }> = [
  {
    pattern: /\/transactions\/import/,
    reason:
      "Importação de extratos é um recurso do Pro. No Pro, você importa CSV, OFX e PDF com prévia antes de confirmar.",
    feature: "csv_import",
  },
  {
    pattern: /\/transactions\/export/,
    reason:
      "Exportação de transações em CSV é um recurso do Pro. No Pro, você leva seus dados para planilhas e outras ferramentas financeiras.",
    feature: "csv_export",
  },
  {
    pattern: /\/forecasts/,
    reason: "A projeção do mês é um recurso do Pro. Veja quanto deve sobrar no saldo até o fim do mês.",
    feature: "forecast",
  },
  {
    pattern: /\/analytics\/trend/,
    reason: "O histórico do painel é um recurso do Pro. Acompanhe até 24 meses da sua evolução financeira.",
    feature: "analytics_trend",
  },
  {
    pattern: /\/salary/,
    reason: "Renda e benefício são recursos do Pro. Planeje salário, INSS e IRRF no mesmo lugar.",
    feature: "salary",
  },
];

const resolvePaywallPayload = (
  url: string,
  serverMessage: string,
  serverCode: string,
): PaymentRequiredPayload => {
  // Prefer the structured code field from the API response.
  // TODO: remove the string-match fallback once PR #245 (fix/paywall-structured-error, v1.30+)
  //       is stable in prod with no old API instances running — the includes("teste encerrado")
  //       branch is dead code after that point.
  const isTrialExpired =
    serverCode === "TRIAL_EXPIRED" ||
    serverMessage.toLowerCase().includes("teste encerrado");

  if (isTrialExpired) {
    return { reason: serverMessage, feature: "unknown", context: "trial_expired" };
  }

  for (const entry of PAYWALL_COPY) {
    if (entry.pattern.test(url)) {
      return { reason: entry.reason, feature: entry.feature, context: "feature_gate" };
    }
  }

  return { reason: serverMessage, feature: "unknown", context: "feature_gate" };
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
      const serverCode: string =
        typeof error?.response?.data?.code === "string"
          ? error.response.data.code
          : "";

      const url: string = error?.config?.url ?? "";
      const payload = resolvePaywallPayload(url, serverMessage, serverCode);

      if (typeof paymentRequiredHandler === "function") {
        paymentRequiredHandler(payload);
      }
    }

    return Promise.reject(error);
  },
);

export const getApiHealth = async (): Promise<ApiHealth> => {
  const { data } = await api.get("/health");
  return data as ApiHealth;
};
