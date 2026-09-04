import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import Wishlist from "../models/Wishlist.js";

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `dc${Date.now()}${n++}`;

async function makeTrip(owner, overrides = {}) {
  return Trip.create({
    name: "Beach Trip",
    destination: { name: "Goa", country: "India", city: "Panaji" },
    owner: owner.user._id,
    members: [{ user: owner.user._id, role: "owner" }],
    ...overrides,
  });
}

describe("Discover & Wishlist", () => {
  let me;
  beforeEach(async () => {
    me = await createAuthUser({ username: uname() });
  });

  describe("GET /api/discover/trips", () => {
    it("returns only public trips, newest-first", async () => {
      const other = await createAuthUser({ username: uname() });
      await makeTrip(other, { name: "Private one", isPublic: false });
      await makeTrip(other, { name: "Public Goa", isPublic: true });
      const res = await request(app).get("/api/discover/trips").set(auth(me.token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.trips).toHaveLength(1);
      expect(res.body.trips[0].name).toBe("Public Goa");
      expect(res.body.trips[0].membersCount).toBe(1);
    });

    it("filters by q across name and destination", async () => {
      const other = await createAuthUser({ username: uname() });
      await makeTrip(other, { name: "Alps Skiing", destination: { name: "Chamonix", country: "France" }, isPublic: true });
      await makeTrip(other, { name: "Goa Getaway", isPublic: true });
      const res = await request(app).get("/api/discover/trips?q=goa").set(auth(me.token));
      expect(res.body.trips).toHaveLength(1);
      expect(res.body.trips[0].name).toBe("Goa Getaway");
    });

    it("escapes regex metacharacters in q (no injection / crash)", async () => {
      const other = await createAuthUser({ username: uname() });
      await makeTrip(other, { name: "Normal", isPublic: true });
      const res = await request(app).get("/api/discover/trips?q=" + encodeURIComponent(".*(")).set(auth(me.token));
      expect(res.status).toBe(200);
      expect(res.body.trips).toHaveLength(0);
    });

    it("paginates with cursor + limit", async () => {
      const other = await createAuthUser({ username: uname() });
      for (let i = 0; i < 3; i++) await makeTrip(other, { name: `Pub ${i}`, isPublic: true });
      const res = await request(app).get("/api/discover/trips?limit=2").set(auth(me.token));
      expect(res.body.trips).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeTruthy();
      const res2 = await request(app)
        .get("/api/discover/trips?limit=2&cursor=" + encodeURIComponent(res.body.nextCursor))
        .set(auth(me.token));
      expect(res2.body.trips).toHaveLength(1);
      expect(res2.body.hasMore).toBe(false);
    });

    it("401 without auth", async () => {
      expect((await request(app).get("/api/discover/trips")).status).toBe(401);
    });
  });

  describe("wishlist", () => {
    const add = (body, t = me.token) => request(app).post("/api/discover/wishlist").set(auth(t)).send(body);

    it("adds an item and is idempotent per (user, kind, refId)", async () => {
      const r1 = await add({ kind: "place", refId: "place_123", title: "Eiffel Tower", rating: 4.7 });
      expect(r1.status).toBe(201);
      expect(r1.body.item.title).toBe("Eiffel Tower");
      const r2 = await add({ kind: "place", refId: "place_123", title: "Eiffel Tower Updated" });
      expect([200, 201]).toContain(r2.status);
      expect(await Wishlist.countDocuments({ user: me.user._id })).toBe(1);
    });

    it("400 on invalid kind or missing refId/title", async () => {
      expect((await add({ kind: "banana", refId: "x", title: "t" })).status).toBe(400);
      expect((await add({ kind: "place", title: "t" })).status).toBe(400);
      expect((await add({ kind: "place", refId: "x" })).status).toBe(400);
    });

    it("sets trip ref when kind=trip with a valid ObjectId", async () => {
      const trip = await makeTrip(me, { isPublic: true });
      const r = await add({ kind: "trip", refId: String(trip._id), title: "Beach Trip" });
      expect(r.status).toBe(201);
      expect(String(r.body.item.trip)).toBe(String(trip._id));
    });

    it("lists newest-first, scoped to the caller, with pagination", async () => {
      const other = await createAuthUser({ username: uname() });
      await add({ kind: "place", refId: "other_owned", title: "Theirs" }, other.token);
      for (let i = 0; i < 3; i++) await add({ kind: "place", refId: `p${i}`, title: `Place ${i}` });
      const res = await request(app).get("/api/discover/wishlist?limit=2").set(auth(me.token));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.items.every((i) => i.title !== "Theirs")).toBe(true);
    });

    it("filters list by kind", async () => {
      await add({ kind: "place", refId: "p1", title: "P" });
      await add({ kind: "hotel", refId: "h1", title: "H" });
      const res = await request(app).get("/api/discover/wishlist?kind=hotel").set(auth(me.token));
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].kind).toBe("hotel");
    });

    it("returns saved refIds for heart state", async () => {
      await add({ kind: "place", refId: "p1", title: "P" });
      await add({ kind: "hotel", refId: "h1", title: "H" });
      const res = await request(app).get("/api/discover/wishlist/keys").set(auth(me.token));
      expect(res.status).toBe(200);
      expect(res.body.refIds.sort()).toEqual(["h1", "p1"]);
    });

    it("removes by refId and by id, 404 when absent", async () => {
      const r = await add({ kind: "place", refId: "p1", title: "P" });
      const byRef = await request(app).delete("/api/discover/wishlist/p1").set(auth(me.token));
      expect(byRef.status).toBe(200);
      const r2 = await add({ kind: "place", refId: "p2", title: "P2" });
      const byId = await request(app).delete(`/api/discover/wishlist/${r2.body.item._id}`).set(auth(me.token));
      expect(byId.status).toBe(200);
      expect((await request(app).delete("/api/discover/wishlist/nope").set(auth(me.token))).status).toBe(404);
    });

    it("cannot remove another user's item (404)", async () => {
      const other = await createAuthUser({ username: uname() });
      await add({ kind: "place", refId: "mine", title: "P" }, other.token);
      const res = await request(app).delete("/api/discover/wishlist/mine").set(auth(me.token));
      expect(res.status).toBe(404);
    });

    it("401 without auth", async () => {
      expect((await request(app).get("/api/discover/wishlist")).status).toBe(401);
      expect((await request(app).post("/api/discover/wishlist").send({ kind: "place", refId: "x", title: "t" })).status).toBe(401);
    });
  });
});
