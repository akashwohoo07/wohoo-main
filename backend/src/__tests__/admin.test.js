import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import DailyActivity from "../models/DailyActivity.js";

vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `adm${Date.now()}${n++}`;

describe("Analytics & Admin", () => {
  const savedAdminEnv = process.env.ADMIN_EMAILS;
  beforeEach(() => { process.env.ADMIN_EMAILS = ""; });
  afterEach(() => { process.env.ADMIN_EMAILS = savedAdminEnv; });

  describe("activity ping (any user)", () => {
    it("records time into the (user, day) rollup with atomic increments", async () => {
      const u = await createAuthUser({ username: uname() });
      expect((await request(app).post("/api/analytics/ping").set(auth(u.token)).send({ seconds: 60 })).status).toBe(200);
      await request(app).post("/api/analytics/ping").set(auth(u.token)).send({ seconds: 90 });
      const day = new Date().toISOString().slice(0, 10);
      const row = await DailyActivity.findOne({ user: u.user._id, day });
      expect(row.activeSeconds).toBe(150);
    });

    it("caps a single ping (anti-abuse) and requires auth", async () => {
      const u = await createAuthUser({ username: uname() });
      await request(app).post("/api/analytics/ping").set(auth(u.token)).send({ seconds: 99999 });
      const row = await DailyActivity.findOne({ user: u.user._id });
      expect(row.activeSeconds).toBe(300); // capped
      expect((await request(app).post("/api/analytics/ping").send({ seconds: 60 })).status).toBe(401);
    });
  });

  describe("admin gate", () => {
    it("blocks non-admins from /api/admin/* (403)", async () => {
      const u = await createAuthUser({ username: uname() });
      expect((await request(app).get("/api/admin/overview").set(auth(u.token))).status).toBe(403);
      expect((await request(app).get("/api/admin/users").set(auth(u.token))).status).toBe(403);
    });

    it("requires auth (401)", async () => {
      expect((await request(app).get("/api/admin/overview")).status).toBe(401);
    });

    it("allows an allowlisted admin (200) and reflects isAdmin in /auth/me", async () => {
      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      expect((await request(app).get("/api/admin/overview").set(auth(admin.token))).status).toBe(200);
      const me = await request(app).get("/api/auth/me").set(auth(admin.token));
      expect(me.body.user.isAdmin).toBe(true);
    });
  });

  describe("admin data", () => {
    it("overview returns totals + time series", async () => {
      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      await request(app).post("/api/analytics/ping").set(auth(admin.token)).send({ seconds: 120 });

      const res = await request(app).get("/api/admin/overview").set(auth(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.totals.users).toBeGreaterThanOrEqual(1);
      expect(res.body.totals.activeToday).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.signupsPerDay)).toBe(true);
      expect(Array.isArray(res.body.activityPerDay)).toBe(true);
    });

    it("lists users with activity + trips, and returns a user's detail", async () => {
      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      const member = await createAuthUser({ username: uname() });
      await Trip.create({ name: "T", destination: { name: "Goa" }, owner: member.user._id, members: [{ user: member.user._id, role: "owner" }] });
      await request(app).post("/api/analytics/ping").set(auth(member.token)).send({ seconds: 180 });

      const list = await request(app).get("/api/admin/users?limit=50").set(auth(admin.token));
      expect(list.status).toBe(200);
      const row = list.body.users.find((u) => String(u._id) === String(member.user._id));
      expect(row.totalMinutes).toBe(3);
      expect(row.tripsOwned).toBe(1);

      const detail = await request(app).get(`/api/admin/users/${member.user._id}`).set(auth(admin.token));
      expect(detail.status).toBe(200);
      expect(detail.body.totalMinutes).toBe(3);
      expect(detail.body.tripsOwned).toBe(1);
      expect(Array.isArray(detail.body.activityPerDay)).toBe(true);
    });

    it("tracks pageviews (anonymous ok), normalizes paths, and surfaces traffic in overview", async () => {
      // Anonymous pageview beacon — no auth required.
      await request(app).post("/api/analytics/pageview").send({ path: "/trips/507f1f77bcf86cd799439011", referrer: "https://www.google.com/search?q=x", device: "mobile" });
      await request(app).post("/api/analytics/pageview").send({ path: "/", referrer: "", device: "desktop" });

      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      const res = await request(app).get("/api/admin/overview").set(auth(admin.token));
      expect(res.body.traffic.pageviewsToday).toBeGreaterThanOrEqual(2);
      expect(res.body.traffic.topPaths.map((p) => p.key)).toContain("/trips/:id"); // id normalized out
      expect(res.body.traffic.topSources.map((s) => s.key)).toEqual(expect.arrayContaining(["google.com", "direct"]));
      expect(res.body.traffic.devices.map((d) => d.key)).toEqual(expect.arrayContaining(["mobile", "desktop"]));
    });

    it("captures visitor country from the CF-IPCountry header for the world map", async () => {
      await request(app).post("/api/analytics/pageview").set("CF-IPCountry", "IN").send({ path: "/", device: "mobile" });
      await request(app).post("/api/analytics/pageview").set("CF-IPCountry", "US").send({ path: "/", device: "desktop" });
      await request(app).post("/api/analytics/pageview").set("CF-IPCountry", "T1").send({ path: "/", device: "desktop" }); // tor/invalid → ignored

      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      const res = await request(app).get("/api/admin/overview").set(auth(admin.token));
      const codes = res.body.traffic.countries.map((c) => c.key);
      expect(codes).toEqual(expect.arrayContaining(["IN", "US"]));
      expect(codes).not.toContain("T1");
    });

    it("404 for an unknown user detail", async () => {
      const admin = await createAuthUser({ username: uname() });
      process.env.ADMIN_EMAILS = admin.user.email;
      expect((await request(app).get("/api/admin/users/507f1f77bcf86cd799439011").set(auth(admin.token))).status).toBe(404);
    });
  });
});
