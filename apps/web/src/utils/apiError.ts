interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
      code?: string;
    };
    status?: number;
  };
  message?: string;
}

export const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const apiError = error as ApiLikeError;
  return apiError.response?.data?.message || apiError.message || fallbackMessage;
};

export const getApiErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  return (error as ApiLikeError).response?.status;
};

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;

  const code = (error as ApiLikeError).response?.data?.code;
  if (typeof code !== "string") return undefined;

  const normalized = code.trim();
  return normalized ? normalized : undefined;
};
