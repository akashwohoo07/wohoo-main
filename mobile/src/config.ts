// API base URL. Set EXPO_PUBLIC_API_URL in .env (or eas.json env per profile).
// Falls back to prod so a fresh clone still talks to a real backend.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "https://api.wohoo.in";

// Google OAuth Web client id — used by native Google Sign-In to mint an ID token
// whose audience the backend verifies. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

// iOS OAuth client id (from Google Cloud console). Required for iOS native sign-in.
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
