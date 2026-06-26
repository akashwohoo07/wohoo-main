import axios from "axios";

// Auth cookies (httpOnly) are set directly by the backend during the OAuth
// redirect — the client never needs to see or handle the tokens itself.

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

let isRefreshing = false;

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
      if (isRefreshing) return Promise.reject(err);
      isRefreshing = true;
      original._retry = true;
      try {
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );
        isRefreshing = false;
        return api(original);
      } catch {
        isRefreshing = false;
        window.location.href = "/login";
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;