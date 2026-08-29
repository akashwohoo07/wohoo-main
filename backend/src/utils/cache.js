import { redisClient } from "../config/redis.js";

// Backend-agnostic cache. Uses Redis when connected, otherwise an in-process
// Map with TTL. The Map fallback is only correct for a single instance — in
// production (multi-instance) REDIS_URL must be set so the cache is shared.
const memory = new Map(); // key -> { value, expiresAt (ms epoch) | null }

function usingRedis() {
  return Boolean(redisClient && redisClient.isOpen);
}

export async function cacheGet(key) {
  if (usingRedis()) {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key, value, ttlSeconds) {
  if (usingRedis()) {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
    return;
  }
  memory.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function cacheDel(key) {
  if (usingRedis()) {
    await redisClient.del(key);
    return;
  }
  memory.delete(key);
}

// Test-only helper to reset the in-memory fallback between tests.
export function _clearMemoryCache() {
  memory.clear();
}
