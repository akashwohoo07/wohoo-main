import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cacheSet, cacheDel, _clearMemoryCache } from "../utils/cache.js";

// These exercise the in-memory fallback (no REDIS_URL in the test env).
describe("cache util (in-memory fallback)", () => {
  beforeEach(() => _clearMemoryCache());

  it("returns null for a missing key", async () => {
    expect(await cacheGet("nope")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    await cacheSet("k1", { a: 1 }, 60);
    expect(await cacheGet("k1")).toEqual({ a: 1 });
  });

  it("expires a value after its TTL", async () => {
    await cacheSet("k2", "v", 60);
    expect(await cacheGet("k2")).toBe("v");

    // Simulate time passing by writing an already-expired entry
    await cacheSet("k3", "v", -1);
    expect(await cacheGet("k3")).toBeNull();
  });

  it("deletes a key", async () => {
    await cacheSet("k4", "v", 60);
    await cacheDel("k4");
    expect(await cacheGet("k4")).toBeNull();
  });
});
