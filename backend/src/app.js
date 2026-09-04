import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import session from "express-session";
import RedisStore from "connect-redis";
import { passport, initializePassport } from "./config/passport.js";
import { config } from "./config/env.js";
import { redisClient } from "./config/redis.js";
import { sanitizeRequest } from "./middleware/sanitize.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import authRoutes from "./routes/authRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import followRoutes from "./routes/followRoutes.js";
import exploreRoutes from "./routes/exploreRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import transportRoutes from "./routes/transportRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import tripChatRoutes from "./routes/tripChatRoutes.js";
import tripNotesRoutes from "./routes/tripNotesRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import discoverRoutes from "./routes/discoverRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

initializePassport();

const app = express();

// Trust the reverse proxy (Nginx/load balancer) so secure cookies and
// rate-limit IP detection work correctly behind it.
app.set("trust proxy", 1);

// Security headers (CSP, HSTS, no-sniff, frameguard, etc.)
app.use(helmet());

// CORS allowlist: CORS_ORIGINS (comma-separated) if set, else CLIENT_URL, else localhost.
// Lets one backend serve multiple frontend origins (apex + www + workers.dev).
const corsAllowlist = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin (curl, server-to-server, same-origin) and any allowlisted origin.
    if (!origin || corsAllowlist.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Shared session store in Redis when available; MemoryStore otherwise
// (single-instance dev/test). Sessions here only hold short-lived OAuth state.
app.use(session({
  store: redisClient
    ? new RedisStore({ client: redisClient, prefix: "wohoo:sess:" })
    : undefined,
  secret: process.env.SESSION_SECRET || "dev-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax", // cross-domain frontend/backend in prod
    maxAge: 5 * 60 * 1000,
  },
}));

app.use(morgan(config.isProd ? "combined" : "dev"));
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(sanitizeRequest);
app.use(passport.initialize());

// Global rate limit across the whole API surface (covers auth too). Auth is
// Google-OAuth only (no password brute-force surface), and /api/auth/me is
// polled on every page load — so the global limiter is the right ceiling here.
app.use("/api", globalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/trips/:tripId/expenses", expenseRoutes);
app.use("/api/trips/:tripId/chat", tripChatRoutes);
app.use("/api/trips/:tripId", tripNotesRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/uploads", uploadRoutes);



app.get("/", (req, res) => res.json({ status: "ok", message: "API is running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

export default app;