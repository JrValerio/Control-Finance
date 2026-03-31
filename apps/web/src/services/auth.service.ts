import { api, withApiRequestContext } from "./api";

export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
}

export interface AuthUserResponse {
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name?: string;
  email: string;
  password: string;
}

export interface GoogleLoginPayload {
  idToken: string;
}

const INVALID_AUTH_RESPONSE_MESSAGE = "Resposta de autenticacao invalida.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAuthUser = (value: unknown): value is AuthUser => {
  if (!isRecord(value)) {
    return false;
  }

  const { id, name, email } = value;
  return (
    (typeof id === "number" || typeof id === "string") &&
    typeof name === "string" &&
    typeof email === "string"
  );
};

const parseUserResponse = (responseData: unknown): AuthUserResponse => {
  if (!isRecord(responseData)) {
    throw new Error(INVALID_AUTH_RESPONSE_MESSAGE);
  }

  if (!isAuthUser(responseData.user)) {
    throw new Error(INVALID_AUTH_RESPONSE_MESSAGE);
  }

  return { user: responseData.user };
};

export const authService = {
  register: async ({
    name = "",
    email,
    password,
  }: RegisterPayload): Promise<AuthUserResponse> => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
    });

    return parseUserResponse(data);
  },

  login: async ({ email, password }: LoginPayload): Promise<AuthUserResponse> => {
    const { data } = await api.post("/auth/login", {
      email,
      password,
    });

    return parseUserResponse(data);
  },

  loginWithGoogle: async ({ idToken }: GoogleLoginPayload): Promise<AuthUserResponse> => {
    const { data } = await api.post("/auth/google", { idToken }, {
      headers: withApiRequestContext({
        feature: "auth",
        operation: "google_signin_callback_xhr",
      }).headers,
    });
    return parseUserResponse(data);
  },

  refresh: async (): Promise<AuthUserResponse> => {
    const { data } = await api.post("/auth/refresh", {}, {
      headers: withApiRequestContext({
        feature: "auth",
        operation: "refresh_token_xhr",
      }).headers,
    });
    return parseUserResponse(data);
  },

  logout: async (): Promise<void> => {
    await api.delete("/auth/logout");
  },

  forgotPassword: async ({ email }: { email: string }): Promise<void> => {
    await api.post("/auth/forgot-password", { email });
  },

  resetPassword: async ({
    token,
    newPassword,
  }: {
    token: string;
    newPassword: string;
  }): Promise<void> => {
    await api.post("/auth/reset-password", { token, newPassword });
  },
};
