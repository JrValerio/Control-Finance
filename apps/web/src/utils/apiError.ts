interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
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
