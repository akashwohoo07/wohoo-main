import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./src/__tests__/globalSetup.js",
    setupFiles: ["./src/__tests__/setup.js"],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.js"],
      exclude: ["src/__tests__/**", "src/server.js"],
    },
    // Set env vars before any module is imported by workers
    env: {
      JWT_SECRET: "test-jwt-secret-minimum-length-32chars!",
      JWT_REFRESH_SECRET: "test-refresh-secret-minimum-length-32!",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      NODE_ENV: "test",
      CLIENT_URL: "http://localhost:5173",
      APP_NAME: "Wohoo",
      FROM_EMAIL: "test@wohoo.app",
      GOOGLE_PLACES_KEY: "test-google-places-key",
    },
  },
});
