// Centralized environment validation — fail fast on misconfiguration.
// Imported once at startup (server.js) and by app.js for derived flags.

const REQUIRED_IN_PRODUCTION = [
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CLIENT_URL",
];

// Secrets must be long enough to resist brute force.
const MIN_SECRET_LENGTH = 32;
const SECRET_VARS = ["JWT_SECRET", "JWT_REFRESH_SECRET", "SESSION_SECRET"];

export function validateEnv() {
  const env = process.env.NODE_ENV || "development";
  const isProd = env === "production";
  const errors = [];

  if (isProd) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) errors.push(`Missing required env var: ${key}`);
    }
    for (const key of SECRET_VARS) {
      const val = process.env[key];
      if (val && val.length < MIN_SECRET_LENGTH) {
        errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters`);
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `Environment validation failed:\n  - ${errors.join("\n  - ")}`
    );
  }
}

export const config = {
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get isTest() {
    return process.env.NODE_ENV === "test";
  },
  get isDev() {
    const env = process.env.NODE_ENV || "development";
    return env === "development";
  },
};
