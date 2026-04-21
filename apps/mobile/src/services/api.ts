import axios from "axios";
import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "cf_refresh_token";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3001";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export const getStoredRefreshToken = () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
export const setStoredRefreshToken = (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
export const deleteStoredRefreshToken = () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const flushQueue = (token: string | null, error: unknown = null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  pendingQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getStoredRefreshToken();
      if (!refreshToken) throw new Error("no_refresh_token");

      const { data } = await axios.post(`${BASE_URL}/auth/mobile/refresh`, { refreshToken });
      const newAccess: string = data.accessToken;
      const newRefresh: string = data.refreshToken;

      setAccessToken(newAccess);
      await setStoredRefreshToken(newRefresh);

      flushQueue(newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (err) {
      flushQueue(null, err);
      setAccessToken(null);
      await deleteStoredRefreshToken();
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);
