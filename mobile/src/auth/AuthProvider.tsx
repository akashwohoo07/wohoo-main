import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "../config";
import { fetchMe, googleMobileLogin, logoutServer } from "../api/endpoints";
import { saveTokens, clearTokens, getAccessToken, getRefreshToken } from "./tokenStore";
import { setOnAuthExpired } from "../api/client";
import type { User } from "../api/types";

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  offlineAccess: false,
});

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (mode: "login" | "signup") => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on launch: if we have a token, fetch the profile. The axios
  // interceptor silently refreshes an expired access token, so a returning user
  // stays logged in (up to the 14-day refresh window) without re-authenticating.
  useEffect(() => {
    setOnAuthExpired(() => setUser(null));
    (async () => {
      try {
        if (await getAccessToken()) setUser(await fetchMe());
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (mode: "login" | "signup") => {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res: any = await GoogleSignin.signIn();
    const idToken = res?.data?.idToken ?? res?.idToken;
    if (!idToken) throw new Error("Google sign-in did not return an ID token");
    const { accessToken, refreshToken, user: u } = await googleMobileLogin(idToken, mode);
    await saveTokens(accessToken, refreshToken);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    const rt = await getRefreshToken();
    try { await logoutServer(rt || undefined); } catch {}
    try { await GoogleSignin.signOut(); } catch {}
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
