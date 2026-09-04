import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import User from "../models/User.js";

// Mock R2 as configured so we can exercise the real controller logic without
// a live bucket. `send` is a stable spy we drive per test.
vi.mock("../config/r2.js", () => {
  const send = vi.fn();
  return {
    r2Configured: true,
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_BASE: "https://cdn.example.com",
    getR2: () => ({ send }),
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://upload.example.com/signed-put"),
}));

import { getR2 } from "../config/r2.js";
const send = getR2().send;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Image uploads (R2 presigned)", () => {
  let user, token;
  beforeEach(async () => {
    ({ user, token } = await createAuthUser());
    send.mockReset();
  });

  describe("presign", () => {
    it("401 without auth", async () => {
      expect((await request(app).post("/api/uploads/presign").send({ kind: "avatar", contentType: "image/png" })).status).toBe(401);
    });

    it("returns an upload URL + key for a valid avatar request", async () => {
      const res = await request(app).post("/api/uploads/presign").set(auth(token)).send({ kind: "avatar", contentType: "image/png" });
      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toBe("https://upload.example.com/signed-put");
      expect(res.body.key).toMatch(new RegExp(`^avatars/${user._id}/.+\\.png$`));
    });

    it("400 on invalid kind or non-image content type", async () => {
      expect((await request(app).post("/api/uploads/presign").set(auth(token)).send({ kind: "banner", contentType: "image/png" })).status).toBe(400);
      expect((await request(app).post("/api/uploads/presign").set(auth(token)).send({ kind: "avatar", contentType: "application/pdf" })).status).toBe(400);
    });
  });

  describe("confirm", () => {
    it("rejects a key that isn't under the caller's prefix (403)", async () => {
      const res = await request(app).post("/api/uploads/confirm").set(auth(token)).send({ kind: "avatar", key: "avatars/someoneelse/x.png" });
      expect(res.status).toBe(403);
    });

    it("verifies the object then saves the public URL on the user", async () => {
      const key = `avatars/${user._id}/pic.png`;
      send.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 1234 }); // HEAD
      const res = await request(app).post("/api/uploads/confirm").set(auth(token)).send({ kind: "avatar", key });
      expect(res.status).toBe(200);
      expect(res.body.url).toBe(`https://cdn.example.com/${key}`);
      const saved = await User.findById(user._id);
      expect(saved.avatar).toBe(`https://cdn.example.com/${key}`);
    });

    it("rejects an oversized image and deletes it (400)", async () => {
      const key = `avatars/${user._id}/huge.png`;
      send.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 26 * 1024 * 1024 }); // HEAD (> 25 MB)
      send.mockResolvedValueOnce({}); // delete
      const res = await request(app).post("/api/uploads/confirm").set(auth(token)).send({ kind: "avatar", key });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/too large/i);
      const saved = await User.findById(user._id);
      expect(saved.avatar).toBeFalsy();
    });

    it("400 when the object doesn't exist (HEAD fails)", async () => {
      const key = `covers/${user._id}/ghost.jpg`;
      send.mockRejectedValueOnce(new Error("NotFound"));
      const res = await request(app).post("/api/uploads/confirm").set(auth(token)).send({ kind: "cover", key });
      expect(res.status).toBe(400);
    });
  });

  describe("remove", () => {
    it("clears the user's avatar", async () => {
      await User.findByIdAndUpdate(user._id, { avatar: "https://cdn.example.com/avatars/x/a.png" });
      send.mockResolvedValueOnce({}); // delete
      const res = await request(app).delete("/api/uploads/avatar").set(auth(token));
      expect(res.status).toBe(200);
      const saved = await User.findById(user._id);
      expect(saved.avatar).toBeFalsy();
    });
  });
});
