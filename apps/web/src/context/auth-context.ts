import { createContext } from "react";
import type {
  AuthUser,
  AuthUserResponse,
  GoogleLoginPayload,
  LoginPayload,
  RegisterPayload,
} from "../services/auth.service";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isInitializing: boolean;
  errorMessage: string;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<AuthUserResponse>;
  register: (payload: RegisterPayload) => Promise<AuthUserResponse>;
  loginWithGoogle: (payload: GoogleLoginPayload) => Promise<AuthUserResponse>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
