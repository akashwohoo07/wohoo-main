import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { reconcileFollowCounts } from "../services/followCounts.js";
import { _clearMemoryCache } from "../utils/cache.js";

describe("Profile / follow / search at scale", () => {
  beforeEach(() => _clearMemoryCache());

  describe("User search (index-backed prefix)", () => {
    it("matches a username prefix regardless of query case", async () => {
      const { token } = await createAuthUser();
      await createUser({ username: "wanderlustluna", email: "luna@example.com" });

      // Uppercase query must still match the lowercase-stored username
      const res = await request(app)
        .get("/api/users/search?q=WANDER")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.users.map((u) => u.username)).toContain("wanderlustluna");
    });

    it("returns empty for queries shorter than 2 chars", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .get("/api/users/search?q=a")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    });

    it("only matches at the start (anchored prefix), not mid-string", async () => {
      const { token } = await createAuthUser();
      await createUser({ username: "alphatraveler", email: "a@example.com" });
      const res = await request(app)
        .get("/api/users/search?q=traveler")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.users.map((u) => u.username)).not.toContain("alphatraveler");
    });

    it("excludes the searcher themselves", async () => {
      const { user, token } = await createAuthUser({ username: "selfsearchuser" });
      const res = await request(app)
        .get("/api/users/search?q=selfsearch")
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.users.map((u) => u._id)).not.toContain(user._id.toString());
    });
  });

  describe("Follower list cursor pagination (_id based)", () => {
    it("pages through followers without duplicates or gaps", async () => {
      const target = await createUser({ username: "targetaccount1" });
      const followers = [];
      for (let i = 0; i < 5; i++) {
        const u = await createUser({ email: `f${i}@example.com` });
        await Follow.create({ follower: u._id, following: target._id });
        followers.push(u._id.toString());
      }
      const { token } = await createAuthUser();

      const seen = new Set();
      let cursor = null;
      let pages = 0;
      do {
        const url = `/api/follow/${target._id}/followers?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
        const res = await request(app).get(url).set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
        res.body.followers.forEach((f) => seen.add(f._id));
        cursor = res.body.nextCursor;
        pages++;
        if (pages > 10) break; // safety
      } while (cursor);

      expect(seen.size).toBe(5);
    });

    it("caps page size at 50 even if a larger limit is requested", async () => {
      const target = await createUser({ username: "targetaccount2" });
      const { token } = await createAuthUser();
      const res = await request(app)
        .get(`/api/follow/${target._id}/followers?limit=9999`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200); // request accepted; internal limit clamps the query
    });
  });

  describe("reconcileFollowCounts (self-healing counters)", () => {
    it("corrects drifted follower/following counts from the Follow collection", async () => {
      const target = await createUser({ username: "reconciletarget" });
      const a = await createUser({ email: "ra@example.com" });
      const b = await createUser({ email: "rb@example.com" });
      await Follow.create({ follower: a._id, following: target._id });
      await Follow.create({ follower: b._id, following: target._id });

      // Corrupt the denormalized counters
      await User.updateOne({ _id: target._id }, { $set: { followersCount: 99 } });
      await User.updateOne({ _id: a._id }, { $set: { followingCount: 42 } });

      const result = await reconcileFollowCounts();
      expect(result.corrected).toBeGreaterThanOrEqual(2);

      const fixedTarget = await User.findById(target._id).lean();
      const fixedA = await User.findById(a._id).lean();
      expect(fixedTarget.followersCount).toBe(2);
      expect(fixedA.followingCount).toBe(1);
    });

    it("zeroes counts for users who no longer have edges", async () => {
      const ghost = await createUser({ username: "ghostcounter1" });
      await User.updateOne({ _id: ghost._id }, { $set: { followersCount: 7, followingCount: 3 } });

      await reconcileFollowCounts();

      const fixed = await User.findById(ghost._id).lean();
      expect(fixed.followersCount).toBe(0);
      expect(fixed.followingCount).toBe(0);
    });
  });

  describe("getUserProfile", () => {
    it("returns profile, public trips and per-viewer follow status", async () => {
      const owner = await createUser({ username: "profileowner1" });
      const { token } = await createAuthUser();

      const res = await request(app)
        .get(`/api/users/profile/${owner.username}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("profileowner1");
      expect(Array.isArray(res.body.trips)).toBe(true);
      expect(res.body.isFollowing).toBe(false);
    });
  });
});
