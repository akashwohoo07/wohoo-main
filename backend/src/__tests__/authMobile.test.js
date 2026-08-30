import { describe, it, expect, vi } from "vitest";

// Mock the Google verifier (a true external). The fake decodes the JSON we pass
// as the "idToken", or throws for the literal "bad" token.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }) {
      if (idToken === "bad") throw new Error("invalid token");
      return { getPayload: () => JSON.parse(idToken) };
    }
  },
}));

import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import { createUser } from "./helpers.js";

const idTokenFor = (p) => JSON.stringify(p);

describe("POST /api/auth/google/mobile", () => {
  it("400 when idToken is missing", async () => {
    const res = await request(app).post("/api/auth/google/mobile").send({ mode: "login" });
    expect(res.status).toBe(400);
  });

  it("401 for an invalid Google token", async () => {
    const res = await request(app).post("/api/auth/google/mobile").send({ idToken: "bad", mode: "login" });
    expect(res.status).toBe(401);
  });

  it("login with no existing account returns 404 no_account", async () => {
    const res = await request(app)
      .post("/api/auth/google/mobile")
      .send({ idToken: idTokenFor({ sub: "g-1", email: "nobody@example.com", name: "N" }), mode: "login" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("no_account");
  });

  it("signup creates the user and returns JWTs in the body", async () => {
    const res = await request(app)
      .post("/api/auth/google/mobile")
      .send({ idToken: idTokenFor({ sub: "g-2", email: "new@example.com", name: "New User" }), mode: "signup" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe("new@example.com");
    expect(res.body.user.refreshToken).toBeUndefined();
    const created = await User.findOne({ email: "new@example.com" });
    expect(created.googleId).toBe("g-2");
  });

  it("login succeeds for an existing account", async () => {
    await createUser({ email: "exists@example.com", googleId: "g-3" });
    const res = await request(app)
      .post("/api/auth/google/mobile")
      .send({ idToken: idTokenFor({ sub: "g-3", email: "exists@example.com", name: "E" }), mode: "login" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("the returned access token authenticates /me", async () => {
    const login = await request(app)
      .post("/api/auth/google/mobile")
      .send({ idToken: idTokenFor({ sub: "g-4", email: "flow@example.com", name: "F" }), mode: "signup" });
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("flow@example.com");
  });
});

describe("POST /api/auth/refresh (mobile, token in body)", () => {
  it("rotates and returns tokens in the body", async () => {
    const login = await request(app)
      .post("/api/auth/google/mobile")
      .send({ idToken: idTokenFor({ sub: "g-5", email: "refresh@example.com", name: "R" }), mode: "signup" });
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // The freshly returned access token must authenticate a protected route.
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("refresh@example.com");
  });
});
