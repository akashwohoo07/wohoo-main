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
import { globalLimiter, authLimiter } from "./middleware/rateLimiter.js";
import authRoutes from "./routes/authRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import followRoutes from "./routes/followRoutes.js";
import exploreRoutes from "./routes/exploreRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import transportRoutes from "./routes/transportRoutes.js";

initializePassport();

const app = express();

// Trust the reverse proxy (Nginx/load balancer) so secure cookies and
// rate-limit IP detection work correctly behind it.
app.set("trust proxy", 1);

// Security headers (CSP, HSTS, no-sniff, frameguard, etc.)
app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
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
    sameSite: "lax",
    maxAge: 5 * 60 * 1000,
  },
}));

app.use(morgan(config.isProd ? "combined" : "dev"));
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(sanitizeRequest);
app.use(passport.initialize());

// Global rate limit across the whole API surface
app.use("/api", globalLimiter);

// Stricter limit on auth endpoints (brute-force protection)
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/users", userRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/transport", transportRoutes);



app.get("/", (req, res) => res.json({ status: "ok", message: "API is running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

export default app;