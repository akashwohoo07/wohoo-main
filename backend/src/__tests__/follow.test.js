import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import User from "../models/User.js";

describe("Follow API", () => {
  describe("POST /api/follow/:userId/follow", () => {
    it("follows another user and updates counts", async () => {
      const { user: follower, token } = await createAuthUser();
      const target = await createUser();

      const res = await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isFollowing).toBe(true);

      const updatedTarget = await User.findById(target._id);
      const updatedFollower = await User.findById(follower._id);
      expect(updatedTarget.followersCount).toBe(1);
      expect(updatedFollower.followingCount).toBe(1);
    });

    it("returns 400 when trying to follow yourself", async () => {
      const { user, token } = await createAuthUser();
      const res = await request(app)
        .post(`/api/follow/${user._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it("returns 409 when already following", async () => {
      const { token } = await createAuthUser();
      const target = await createUser();

      await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.isFollowing).toBe(true);
    });

    it("returns 404 for a non-existent user", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .post("/api/follow/000000000000000000000000/follow")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/follow/:userId/follow", () => {
    it("unfollows a user and decrements counts", async () => {
      const { user: follower, token } = await createAuthUser();
      const target = await createUser();

      // Follow first
      await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);

      // Unfollow
      const res = await request(app)
        .delete(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.isFollowing).toBe(false);

      const updatedTarget = await User.findById(target._id);
      const updatedFollower = await User.findById(follower._id);
      expect(updatedTarget.followersCount).toBe(0);
      expect(updatedFollower.followingCount).toBe(0);
    });

    it("returns 404 when not following the user", async () => {
      const { token } = await createAuthUser();
      const target = await createUser();
      const res = await request(app)
        .delete(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/follow/:userId/follow-status", () => {
    it("returns isFollowing: false when not following", async () => {
      const { token } = await createAuthUser();
      const target = await createUser();
      const res = await request(app)
        .get(`/api/follow/${target._id}/follow-status`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.isFollowing).toBe(false);
    });

    it("returns isFollowing: true after following", async () => {
      const { token } = await createAuthUser();
      const target = await createUser();

      await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .get(`/api/follow/${target._id}/follow-status`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.isFollowing).toBe(true);
    });
  });

  describe("GET /api/follow/:userId/followers", () => {
    it("returns paginated list of followers", async () => {
      const target = await createUser();
      const { token: t1 } = await createAuthUser();
      const { token: t2 } = await createAuthUser();

      await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${t1}`);
      await request(app)
        .post(`/api/follow/${target._id}/follow`)
        .set("Authorization", `Bearer ${t2}`);

      const { token: anyToken } = await createAuthUser();
      const res = await request(app)
        .get(`/api/follow/${target._id}/followers`)
        .set("Authorization", `Bearer ${anyToken}`);
      expect(res.status).toBe(200);
      expect(res.body.followers).toHaveLength(2);
      expect(res.body.hasMore).toBe(false);
    });
  });

  describe("GET /api/follow/:userId/following", () => {
    it("returns list of users the target is following", async () => {
      const { user, token } = await createAuthUser();
      const t1 = await createUser();
      const t2 = await createUser();

      await request(app)
        .post(`/api/follow/${t1._id}/follow`)
        .set("Authorization", `Bearer ${token}`);
      await request(app)
        .post(`/api/follow/${t2._id}/follow`)
        .set("Authorization", `Bearer ${token}`);

      const { token: anyToken } = await createAuthUser();
      const res = await request(app)
        .get(`/api/follow/${user._id}/following`)
        .set("Authorization", `Bearer ${anyToken}`);
      expect(res.status).toBe(200);
      expect(res.body.following).toHaveLength(2);
    });
  });
});
