import axios from "axios";

// Auth cookies (httpOnly) are set directly by the backend during the OAuth
// redirect — the client never needs to see or handle the tokens itself.

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

// SINGLE-FLIGHT refresh: no matter how many requests hit a 401 at once (or
// AuthContext calling on load), they all await ONE /auth/refresh. This prevents
// a stampede of concurrent refreshes from stepping on each other and logging the
// user out. Exported so AuthContext shares the exact same in-flight promise.
let refreshPromise = null;
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url.includes("/auth/refresh") &&
      !original.url.includes("/auth/me")
    ) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original); // retry with the fresh access token
      } catch {
        // Refresh genuinely failed — let the caller handle it. We deliberately
        // do NOT hard-redirect here: a transient refresh hiccup shouldn't nuke a
        // valid session. Route guards / AuthContext decide real logout.
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
