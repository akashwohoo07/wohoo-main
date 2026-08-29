import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, generateRefreshToken } from "./helpers.js";
import { hashToken } from "../utils/tokens.js";
import { sanitizeRequest, escapeRegex } from "../middleware/sanitize.js";
import User from "../models/User.js";

describe("Security", () => {
  describe("Helmet security headers", () => {
    it("sets X-Content-Type-Options: nosniff", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("hides X-Powered-By (no Express fingerprint)", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("escapeRegex", () => {
    it("escapes regex special characters", () => {
      expect(escapeRegex(".*+?")).toBe("\\.\\*\\+\\?");
      expect(escapeRegex("a.b")).toBe("a\\.b");
      expect(escapeRegex("plain")).toBe("plain");
    });
  });

  describe("sanitizeRequest middleware", () => {
    function run(reqLike) {
      let called = false;
      sanitizeRequest(reqLike, {}, () => { called = true; });
      return called;
    }

    it("strips keys starting with $ from body", () => {
      const req = { body: { email: { $gt: "" }, name: "ok" }, params: {}, query: {} };
      run(req);
      expect(req.body.email).toEqual({});
      expect(req.body.name).toBe("ok");
    });

    it("strips keys containing a dot", () => {
      const req = { body: { "a.b": 1, safe: 2 }, params: {}, query: {} };
      run(req);
      expect(req.body["a.b"]).toBeUndefined();
      expect(req.body.safe).toBe(2);
    });

    it("recursively scrubs nested objects", () => {
      const req = { body: { nested: { $where: "x", ok: 1 } }, params: {}, query: {} };
      run(req);
      expect(req.body.nested.$where).toBeUndefined();
      expect(req.body.nested.ok).toBe(1);
    });

    it("calls next()", () => {
      const req = { body: {}, params: {}, query: {} };
      expect(run(req)).toBe(true);
    });
  });

  describe("NoSQL injection is neutralized end-to-end", () => {
    it("does not authenticate via operator-injected query", async () => {
      // A malformed Bearer with operator-style payload must not bypass auth.
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer { \"$ne\": null }");
      expect(res.status).toBe(401);
    });
  });

  describe("Regex injection in user search", () => {
    it("treats special characters literally, not as a wildcard", async () => {
      const { token } = await createAuthUser();
      await User.create({
        name: "Alice",
        email: "alice@example.com",
        username: "alicetraveler",
        isVerified: true,
      });

      // ".*" would match everyone if injected raw; escaped it matches nobody.
      const res = await request(app)
        .get("/api/users/search?q=.*")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(0);
    });
  });

  describe("Refresh token is stored hashed", () => {
    it("never stores the raw refresh token in the database", async () => {
      const { user } = await createAuthUser();
      const refreshToken = generateRefreshToken(user._id);
      await User.findByIdAndUpdate(user._id, { refreshToken: hashToken(refreshToken) });

      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `refreshToken=${refreshToken}`);

      const updated = await User.findById(user._id).select("+refreshToken");
      // Stored value must be a hash, never the raw JWT
      expect(updated.refreshToken).not.toBe(refreshToken);
      expect(updated.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
