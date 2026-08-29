import { createClient } from "redis";

// The client is created (but NOT connected) at module load so it can be handed
// to the session store synchronously in app.js. Connection happens in
// server.js via connectRedis(). node-redis queues commands until connected.
//
// When REDIS_URL is unset (local dev / CI / tests) there is no client at all,
// and callers fall back to in-memory behavior. This keeps the app running
// without a Redis server for single-instance use.
export const redisClient = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

if (redisClient) {
  redisClient.on("error", (err) => console.error("Redis error:", err.message));
}

export async function connectRedis() {
  if (!redisClient) {
    console.log(
      "ℹ️  REDIS_URL not set — using in-memory cache & session store (single-instance only)"
    );
    return null;
  }
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("✅ Redis connected");
  }
  return redisClient;
}

export async function disconnectRedis() {
  if (redisClient?.isOpen) await redisClient.quit();
}
