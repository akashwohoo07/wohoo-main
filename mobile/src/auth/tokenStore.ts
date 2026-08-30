import * as SecureStore from "expo-secure-store";

// Tokens live in the device keychain/keystore — never AsyncStorage (which is
// plaintext). Access token is short-lived; refresh token is the sensitive one.
const ACCESS = "wohoo.accessToken";
const REFRESH = "wohoo.refreshToken";

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS, accessToken),
    SecureStore.setItemAsync(REFRESH, refreshToken),
  ]);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS),
    SecureStore.deleteItemAsync(REFRESH),
  ]);
}
