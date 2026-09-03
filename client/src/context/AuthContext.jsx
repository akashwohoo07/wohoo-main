import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const res = await api.get("/auth/me");
        if (!cancelled) setUser(res.data.user);
      } catch {
        // The 15-min access token has likely expired. Try one silent refresh
        // with the long-lived (14-day) refresh token, then retry /me. This is
        // what keeps a user logged in after closing and reopening the tab —
        // they only truly log out if the refresh token is gone/expired/revoked.
        try {
          await api.post("/auth/refresh");
          const res = await api.get("/auth/me");
          if (!cancelled) setUser(res.data.user);
        } catch {
          if (!cancelled) setUser(null); // genuinely logged out
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUser();
    return () => { cancelled = true; };
  }, []); // ← runs ONCE only

  // Activity heartbeat: while logged in and the tab is visible, report time so
  // the admin dashboard can measure engagement. Cheap (one small POST/interval,
  // paused when the tab is hidden). The interval value == the time credited.
  useEffect(() => {
    if (!user) return;
    const INTERVAL = 60; // seconds
    const ping = () => {
      if (document.visibilityState === "visible") {
        api.post("/analytics/ping", { seconds: INTERVAL }).catch(() => {});
      }
    };
    ping(); // credit the first minute immediately
    const t = setInterval(ping, INTERVAL * 1000);
    return () => clearInterval(t);
  }, [user]);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);