import rateLimit from "express-rate-limit";

// Relaxed limits outside production so local dev and the test suite aren't
// throttled. Production values are the ones that actually protect the API.
const isProd = process.env.NODE_ENV === "production";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 1000,
  message: { success: false, message: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter cap on image-upload signing (each call mints a direct-to-R2 URL).
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 20 : 1000,
  message: { success: false, message: "Too many uploads. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});