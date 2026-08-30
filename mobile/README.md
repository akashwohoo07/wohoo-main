# Wohoo — Mobile (Expo / React Native)

Production React Native app for iOS + Android. Shares the same backend as web
(`https://api.wohoo.in`). Built with Expo SDK 57, expo-router, NativeWind,
TanStack Query, and native Google Sign-In.

## Stack
- **Expo + EAS** (managed) — builds/submits to both stores, OTA updates
- **expo-router** — file-based navigation + deep links (`wohoo://`)
- **NativeWind** — Tailwind styling (matches the web design)
- **TanStack Query** — data fetching/caching against the existing REST API
- **expo-secure-store** — tokens in Keychain/Keystore
- **@react-native-google-signin** — native Google auth → backend token exchange
- **FlashList + expo-image** — smooth lists + cached images

## Run locally
```bash
cd mobile
npm install
cp .env.example .env          # fill in the Google client IDs (see below)
npx expo start                # press i (iOS sim) / a (Android) / scan in Expo Go*
```
\* Native Google Sign-In needs a **dev build** (not Expo Go). Create one with:
```bash
npx expo run:ios      # or: npx expo run:android
# or a cloud dev build:
eas build --profile development --platform ios
```

## Google Sign-In setup (one-time)
In Google Cloud Console → Credentials, create OAuth client IDs:
1. **iOS** client (bundle id `in.wohoo.app`) → put its value in
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and its *reversed* form in `app.json`
   (`iosUrlScheme: com.googleusercontent.apps.<id>`).
2. **Android** client (package `in.wohoo.app` + SHA-1 from EAS credentials).
3. **Web** client — the SAME id the backend verifies (`GOOGLE_CLIENT_ID`) →
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
Add the iOS + Android client IDs to the backend `GOOGLE_MOBILE_AUDIENCES`
(comma-separated) so it accepts their ID tokens.

## Build & publish (EAS)
```bash
npm i -g eas-cli && eas login
eas build:configure
# internal test builds (point at beta backend):
eas build --profile preview --platform all
# store builds (point at prod backend):
eas build --profile production --platform all
eas submit --profile production --platform ios      # needs Apple Developer ($99/yr)
eas submit --profile production --platform android   # needs Google Play ($25)
```

## Structure
```
src/
  app/                 expo-router routes
    _layout.tsx        providers + auth gate
    login.tsx
    (tabs)/            Trips · Find people · Profile
    trip/[id].tsx      itinerary + explore nearby
    trip/create.tsx
    u/[username].tsx   public profile + follow
    invite/[token].tsx deep-link invite accept
  api/                 axios client (auto token refresh) + typed endpoints
  auth/                secure token store + AuthProvider (Google Sign-In)
  components/          UI primitives + TripCard
  lib/queryClient.ts
```

## Backend contract (already live)
- `POST /api/auth/google/mobile` — verify Google ID token → returns JWTs in body
- `POST /api/auth/refresh` — accepts refresh token in body (mobile) → new JWTs
- everything else is the shared REST API (trips, explore, profile, follow, invites)
