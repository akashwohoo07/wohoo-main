import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_URL } from "../config";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "../auth/tokenStore";

// Single axios instance. Requests carry the access token as a Bearer header;
// on a 401 we transparently refresh once with the stored refresh token and retry.
export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 });

// Called when refresh fails (session truly dead) so the app can route to login.
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(fn: () => void) {
  onAuthExpired = fn;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// De-dupe concurrent refreshes: if several requests 401 at once, only one hits
// /auth/refresh and the rest await its result.
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
    if (res.data?.accessToken && res.data?.refreshToken) {
      await saveTokens(res.data.accessToken, res.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !original.url?.includes("/auth/refresh")) {
      original._retry = true;
      if (!refreshing) refreshing = tryRefresh();
      const ok = await refreshing;
      refreshing = null;

      if (ok) {
        const token = await getAccessToken();
        if (token) original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      await clearTokens();
      onAuthExpired?.();
    }
    return Promise.reject(error);
  }
);
