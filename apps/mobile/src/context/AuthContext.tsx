import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as authService from "../services/auth.service";
import type { AuthUser, LoginPayload } from "../services/auth.service";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    authService.refresh()
      .then((tokens) => {
        if (tokens) setUser(tokens.user);
      })
      .catch(() => {
        // no valid session — stay logged out
      })
      .finally(() => {
        setIsInitializing(false);
      });
  }, []);

  async function login(payload: LoginPayload) {
    const tokens = await authService.login(payload);
    setUser(tokens.user);
  }

  async function logout() {
    await authService.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !isInitializing && user !== null,
        isInitializing,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
