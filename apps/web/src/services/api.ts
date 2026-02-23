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

const normalizeToken = (token: string): string => token.trim();

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
export const AUTH_TOKEN_STORAGE_KEY = "control_finance.auth_token";
const REQUEST_ID_HEADER_NAME = "x-request-id";
const isApiConfigured = Boolean(API_URL);
let unauthorizedHandler: UnauthorizedHandler = undefined;
let paymentRequiredHandler: PaymentRequiredHandler = undefined;

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

export const getStoredToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!storedToken) {
    return "";
  }

  return normalizeToken(storedToken);
};

export const setStoredToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    clearStoredToken();
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalizedToken);
};

export const clearStoredToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
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
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!isApiConfigured) {
    return Promise.reject(createApiConfigurationError());
  }

  setRequestHeader(config, REQUEST_ID_HEADER_NAME, createRequestId());
  const token = getStoredToken();

  if (!token) {
    return config;
  }

  setRequestHeader(config, "Authorization", `Bearer ${token}`);

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
      clearStoredToken();

      if (typeof unauthorizedHandler === "function") {
        unauthorizedHandler();
      }
    }

    if (error?.response?.status === 402) {
      const message: string =
        typeof error?.response?.data?.message === "string"
          ? error.response.data.message
          : "";

      if (typeof paymentRequiredHandler === "function") {
        paymentRequiredHandler(message);
      }
    }

    return Promise.reject(error);
  },
);

export const getApiHealth = async (): Promise<ApiHealth> => {
  const { data } = await api.get("/health");
  return data as ApiHealth;
};
