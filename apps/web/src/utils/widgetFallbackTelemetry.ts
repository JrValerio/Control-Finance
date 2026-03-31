type ApiErrorLike = {
  message?: string;
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
    data?: {
      message?: string;
      requestId?: unknown;
    };
  };
  config?: {
    headers?: Record<string, unknown>;
  };
};

const REQUEST_ID_HEADER_NAME = "x-request-id";

const readHeaderValue = (headers: Record<string, unknown> | undefined, headerName: string): string => {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const directValue = headers[headerName] ?? headers[headerName.toLowerCase()] ?? "";
  return typeof directValue === "string" ? directValue.trim() : "";
};

export const resolveApiRequestId = (error: unknown): string | null => {
  const apiError = error as ApiErrorLike;

  const responseHeaderRequestId = readHeaderValue(apiError?.response?.headers, REQUEST_ID_HEADER_NAME);
  if (responseHeaderRequestId) {
    return responseHeaderRequestId;
  }

  const bodyRequestId =
    typeof apiError?.response?.data?.requestId === "string"
      ? apiError.response.data.requestId.trim()
      : "";
  if (bodyRequestId) {
    return bodyRequestId;
  }

  const requestHeaderRequestId = readHeaderValue(apiError?.config?.headers, REQUEST_ID_HEADER_NAME);
  if (requestHeaderRequestId) {
    return requestHeaderRequestId;
  }

  return null;
};

export const logWidgetFallbackError = ({
  widget,
  operation,
  error,
  fallbackRendered,
}: {
  widget: string;
  operation: string;
  error: unknown;
  fallbackRendered: boolean;
}) => {
  const apiError = error as ApiErrorLike;

  console.error(
    JSON.stringify({
      level: "error",
      event: "web.widget.fallback",
      page: "home",
      widget,
      operation,
      requestId: resolveApiRequestId(error),
      status: Number(apiError?.response?.status) || null,
      message:
        (typeof apiError?.response?.data?.message === "string" &&
          apiError.response.data.message.trim()) ||
        (typeof apiError?.message === "string" && apiError.message.trim()) ||
        "Unexpected widget error.",
      outcome: "error",
      fallbackRendered,
    }),
  );
};
