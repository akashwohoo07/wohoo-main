import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, generateRefreshToken } from "./helpers.js";
import { hashToken } from "../utils/tokens.js";
import User from "../models/User.js";

describe("Auth API", () => {
  describe("GET /api/auth/me", () => {
    it("returns 401 without a token", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 401 with a malformed token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("returns the current user with a valid token", async () => {
      const { user, token } = await createAuthUser();
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user._id).toBe(user._id.toString());
      expect(res.body.user.email).toBe(user.email);
      expect(res.body.user.refreshToken).toBeUndefined();
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns 401 with no refresh token cookie", async () => {
      const res = await request(app).post("/api/auth/refresh");
      expect(res.status).toBe(401);
    });

    it("returns 401 when refresh token does not match stored token", async () => {
      const { user } = await createAuthUser();
      const fakeRefresh = generateRefreshToken(user._id);
      // stored token is null/different — no update done
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${fakeRefresh}`);
      expect(res.status).toBe(401);
    });

    it("issues a new access token with valid matching refresh token", async () => {
      const { user } = await createAuthUser();
      const refreshToken = generateRefreshToken(user._id);
      await User.findByIdAndUpdate(user._id, { refreshToken: hashToken(refreshToken) });

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${refreshToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Cookie should be set
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.startsWith("accessToken="))).toBe(true);
    });

    it("slides a long-lived (≈1yr) refresh session and rotates the token", async () => {
      const { user } = await createAuthUser();
      const refreshToken = generateRefreshToken(user._id);
      const oldHash = hashToken(refreshToken);
      await User.findByIdAndUpdate(user._id, { refreshToken: oldHash });

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${refreshToken}`);
      expect(res.status).toBe(200);

      const cookies = res.headers["set-cookie"];
      const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
      expect(refreshCookie).toBeDefined();
      // Sliding session: the refresh cookie carries a long Max-Age (> 300 days).
      const maxAge = Number(/Max-Age=(\d+)/i.exec(refreshCookie)?.[1]);
      expect(maxAge).toBeGreaterThan(300 * 24 * 60 * 60);
      // httpOnly (not readable by JS) — XSS-safe.
      expect(/HttpOnly/i.test(refreshCookie)).toBe(true);

      // Rotation: the stored hash changed, so the OLD token no longer works.
      const after = await User.findById(user._id).select("+refreshToken");
      expect(after.refreshToken).not.toBe(oldHash);
      const reuse = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${refreshToken}`);
      expect(reuse.status).toBe(401);
    });

    it("refreshes for a legacy account whose username predates schema rules", async () => {
      // Reproduces the bug where .save() re-validated the whole document and
      // rejected an existing sub-12-char username on an unrelated write.
      const legacy = new User({
        name: "Legacy",
        email: "legacy@example.com",
        username: "shortname9", // 10 chars — below current minlength of 12
        isVerified: true,
      });
      await legacy.save({ validateBeforeSave: false });

      const refreshToken = generateRefreshToken(legacy._id);
      await User.findByIdAndUpdate(legacy._id, { refreshToken: hashToken(refreshToken) });

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${refreshToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns 200 and clears cookies", async () => {
      const { user } = await createAuthUser();
      const refreshToken = generateRefreshToken(user._id);
      await User.findByIdAndUpdate(user._id, { refreshToken: hashToken(refreshToken) });

      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", `refreshToken=${refreshToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Cookies cleared
      const cookies = res.headers["set-cookie"] || [];
      const accessCleared = cookies.some((c) => c.includes("accessToken=;") || c.includes("accessToken=,"));
      const refreshCleared = cookies.some((c) => c.includes("refreshToken=;") || c.includes("refreshToken=,"));
      expect(accessCleared || refreshCleared).toBe(true);
    });
  });

  describe("GET /health", () => {
    it("returns ok without auth", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });
});
