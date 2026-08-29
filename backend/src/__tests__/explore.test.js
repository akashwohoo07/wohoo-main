import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import { _clearMemoryCache } from "../utils/cache.js";

const samplePlacesResponse = {
  places: [
    {
      id: "place-1",
      displayName: { text: "Test Hotel" },
      location: { latitude: 15.3, longitude: 74.1 },
      formattedAddress: "Somewhere, Goa",
      rating: 4.5,
      userRatingCount: 120,
      types: ["hotel"],
    },
  ],
};

describe("Explore API (caching)", () => {
  beforeEach(() => {
    _clearMemoryCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => samplePlacesResponse,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/explore/search?ll=15.3,74.1&kind=stays");
    expect(res.status).toBe(401);
  });

  it("returns 400 when ll is missing", async () => {
    const { token } = await createAuthUser();
    const res = await request(app)
      .get("/api/explore/search?kind=stays")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("fetches from the upstream API on a cache miss", async () => {
    const { token } = await createAuthUser();
    const res = await request(app)
      .get("/api/explore/search?ll=15.3,74.1&kind=stays")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].name).toBe("Test Hotel");
    expect(res.body.cached).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves an identical second request from cache without calling upstream", async () => {
    const { token } = await createAuthUser();
    const url = "/api/explore/search?ll=15.3,74.1&kind=stays";

    const first = await request(app).get(url).set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);

    const second = await request(app).get(url).set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.results).toEqual(first.body.results);
    // Upstream still called only once — second request hit the cache
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a different cache entry for a different category", async () => {
    const { token } = await createAuthUser();
    await request(app)
      .get("/api/explore/search?ll=15.3,74.1&kind=stays")
      .set("Authorization", `Bearer ${token}`);
    await request(app)
      .get("/api/explore/search?ll=15.3,74.1&kind=eats")
      .set("Authorization", `Bearer ${token}`);
    // Different kind → different key → upstream called twice
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
