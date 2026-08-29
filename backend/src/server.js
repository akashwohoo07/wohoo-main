import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { connectRedis } from "./config/redis.js";

// Fail fast if the environment is misconfigured (missing/weak secrets in prod).
validateEnv();

const PORT = process.env.PORT || 8000;

try {
  await connectRedis(); // no-op when REDIS_URL is unset
  await connectDB();
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
} catch (err) {
  console.error("Startup failed:", err);
  process.exit(1);
}
