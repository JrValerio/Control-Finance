import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { authService } from "../services/auth.service";
import type {
  AuthUserResponse,
  AuthUser,
  GoogleLoginPayload,
  LoginPayload,
  RegisterPayload,
} from "../services/auth.service";
import { setUnauthorizedHandler } from "../services/api";
import { AuthContext } from "./auth-context";
import type { AuthContextValue } from "./auth-context";

interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface AuthProviderProps {
  children: ReactNode;
}

const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const apiError = error as ApiLikeError;
  return apiError.response?.data?.message || apiError.message || fallbackMessage;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const bootstrapped = useRef(false);

  // Register the unauthorized handler before bootstrap runs
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setErrorMessage("");
    });

    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, []);

  // Bootstrap: attempt to restore session via refresh token cookie.
  // Cookies are httpOnly so JS cannot read them — we probe with a refresh call.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    authService
      .refresh()
      .then(({ user: refreshedUser }) => {
        setUser(refreshedUser);
      })
      .catch(() => {
        // No valid session — stay unauthenticated
        setUser(null);
      })
      .finally(() => {
        setIsInitializing(false);
      });
  }, []);

  const login = useCallback(
    async ({ email, password }: LoginPayload): Promise<AuthUserResponse> => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await authService.login({ email, password });
        setUser(response.user);
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error, "Não foi possível fazer login.");
        setErrorMessage(message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const register = useCallback(
    async ({ name, email, password }: RegisterPayload): Promise<AuthUserResponse> => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await authService.register({ name, email, password });
        setUser(response.user);
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error, "Não foi possível criar conta.");
        setErrorMessage(message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const loginWithGoogle = useCallback(
    async ({ idToken }: GoogleLoginPayload): Promise<AuthUserResponse> => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await authService.loginWithGoogle({ idToken });
        setUser(response.user);
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error, "Não foi possível autenticar com Google.");
        setErrorMessage(message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Best-effort: clear local state even if the server call fails
    } finally {
      setUser(null);
      setErrorMessage("");
    }
  }, []);

  const clearError = useCallback((): void => {
    setErrorMessage("");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isInitializing,
      errorMessage,
      isAuthenticated: !isInitializing && user !== null,
      login,
      register,
      loginWithGoogle,
      logout,
      clearError,
    }),
    [user, isLoading, isInitializing, errorMessage, login, register, loginWithGoogle, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
