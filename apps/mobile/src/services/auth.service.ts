import { apiClient, setAccessToken, setStoredRefreshToken, deleteStoredRefreshToken, getStoredRefreshToken } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>("/auth/mobile/login", payload);
  setAccessToken(data.accessToken);
  await setStoredRefreshToken(data.refreshToken);
  return data;
}

export async function refresh(): Promise<AuthTokens | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;

  const { data } = await apiClient.post<AuthTokens>("/auth/mobile/refresh", { refreshToken });
  setAccessToken(data.accessToken);
  await setStoredRefreshToken(data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/mobile/logout", { refreshToken: await getStoredRefreshToken() });
  } finally {
    setAccessToken(null);
    await deleteStoredRefreshToken();
  }
}
