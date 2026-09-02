import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import Invitation from "../models/Invitation.js";
import crypto from "crypto";

vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `tc${Date.now()}${n++}`;
const sampleDestination = { name: "Goa", fullLabel: "Goa, India" };

async function makeTrip(memberRoles = []) {
  const owner = await createAuthUser({ username: uname() });
  const members = [];
  for (const role of memberRoles) {
    const m = await createAuthUser({ username: uname() });
    members.push({ ...m, role });
  }
  const trip = await Trip.create({
    name: "Goa Trip",
    destination: sampleDestination,
    owner: owner.user._id,
    members: [{ user: owner.user._id, role: "owner" }, ...members.map((m) => ({ user: m.user._id, role: m.role }))],
  });
  return { owner, members, trip };
}

describe("Trip chat", () => {
  let owner, editor, viewer, trip;
  beforeEach(async () => {
    const s = await makeTrip(["editor", "viewer"]);
    owner = s.owner; editor = s.members[0]; viewer = s.members[1]; trip = s.trip;
  });
  const base = () => `/api/trips/${trip._id}/chat`;
  const send = (token, body) => request(app).post(base()).set(auth(token)).send(body);

  describe("access control", () => {
    it("lets any trip member (incl. viewer) read and send", async () => {
      expect((await send(viewer.token, { text: "hi" })).status).toBe(201);
      expect((await request(app).get(base()).set(auth(editor.token))).status).toBe(200);
    });

    it("blocks non-members (403) — this is how leaving/removal cuts access", async () => {
      const stranger = await createAuthUser({ username: uname() });
      expect((await send(stranger.token, { text: "let me in" })).status).toBe(403);
      expect((await request(app).get(base()).set(auth(stranger.token))).status).toBe(403);
    });

    it("401 without auth, 404 for an unknown trip", async () => {
      expect((await request(app).get(base())).status).toBe(401);
      expect((await request(app).get(`/api/trips/507f1f77bcf86cd799439011/chat`).set(auth(owner.token))).status).toBe(404);
    });
  });

  describe("send / list", () => {
    it("sends text and lists chronologically with pagination", async () => {
      for (let i = 0; i < 3; i++) await send(owner.token, { text: `m${i}` });
      const res = await request(app).get(`${base()}?limit=2`).set(auth(editor.token));
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(new Date(res.body.messages[0].createdAt) <= new Date(res.body.messages[1].createdAt)).toBe(true);
    });

    it("rejects an empty text message (400)", async () => {
      expect((await send(owner.token, { text: "   " })).status).toBe(400);
    });
  });

  describe("place sharing", () => {
    it("shares a place with a denormalized card (no re-fetch)", async () => {
      const res = await send(owner.token, {
        type: "place_share",
        text: "how about this?",
        sharedPlace: { placeId: "abc", name: "Taj Beach Resort", category: "hotel", rating: 4.6, address: "Baga", photo: "http://x/y.jpg", lat: 15.5, lng: 73.7 },
      });
      expect(res.status).toBe(201);
      expect(res.body.message.type).toBe("place_share");
      expect(res.body.message.sharedPlace.name).toBe("Taj Beach Resort");
      expect(res.body.message.sharedPlace.rating).toBe(4.6);
    });

    it("400 when a place has no name", async () => {
      expect((await send(owner.token, { type: "place_share", sharedPlace: { category: "hotel" } })).status).toBe(400);
    });
  });

  describe("replies", () => {
    it("replies to a message and returns the quoted target", async () => {
      const parent = await send(owner.token, { text: "where should we stay?" });
      const res = await send(editor.token, { text: "the Taj!", replyTo: parent.body.message._id });
      expect(res.status).toBe(201);
      expect(res.body.message.replyTo._id).toBe(parent.body.message._id);
      expect(res.body.message.replyTo.text).toBe("where should we stay?");
      expect(res.body.message.replyTo.sender.username).toBe(owner.user.username);
    });

    it("400 for an invalid reply target or one from another trip", async () => {
      expect((await send(owner.token, { text: "x", replyTo: "not-an-id" })).status).toBe(400);
      const other = await makeTrip();
      const foreign = await request(app).post(`/api/trips/${other.trip._id}/chat`).set(auth(other.owner.token)).send({ text: "foreign" });
      expect((await send(owner.token, { text: "x", replyTo: foreign.body.message._id })).status).toBe(400);
    });
  });

  describe("reactions", () => {
    it("toggles a reaction", async () => {
      const posted = await send(owner.token, { text: "yay" });
      const mid = posted.body.message._id;
      let res = await request(app).post(`${base()}/${mid}/react`).set(auth(editor.token)).send({ emoji: "🎉" });
      expect(res.body.message.reactions[0].users).toHaveLength(1);
      res = await request(app).post(`${base()}/${mid}/react`).set(auth(editor.token)).send({ emoji: "🎉" });
      expect(res.body.message.reactions).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("sender deletes own (not admin); owner deletes any (admin)", async () => {
      const mine = await send(editor.token, { text: "mine" });
      const own = await request(app).delete(`${base()}/${mine.body.message._id}`).set(auth(editor.token));
      expect(own.body.message.deletedByAdmin).toBe(false);

      const theirs = await send(viewer.token, { text: "theirs" });
      const admin = await request(app).delete(`${base()}/${theirs.body.message._id}`).set(auth(owner.token));
      expect(admin.body.message.deletedByAdmin).toBe(true);
      expect(admin.body.message.text).toBeUndefined();
    });

    it("a member cannot delete someone else's message (403)", async () => {
      const posted = await send(owner.token, { text: "keep" });
      expect((await request(app).delete(`${base()}/${posted.body.message._id}`).set(auth(editor.token))).status).toBe(403);
    });
  });

  describe("live updates via ?after", () => {
    it("returns reaction changes in `updated`", async () => {
      const posted = await send(owner.token, { text: "old" });
      const after = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 10));
      await request(app).post(`${base()}/${posted.body.message._id}/react`).set(auth(editor.token)).send({ emoji: "👍" });
      const poll = await request(app).get(`${base()}?after=${encodeURIComponent(after)}`).set(auth(owner.token));
      const upd = poll.body.updated.find((m) => m._id === posted.body.message._id);
      expect(upd.reactions[0].emoji).toBe("👍");
    });
  });

  describe("system message on invite accept", () => {
    it("posts '@user joined the trip' when an invite is accepted", async () => {
      const invitee = await createAuthUser({ username: uname(), email: `inv${Date.now()}@x.com` });
      const token = crypto.randomBytes(16).toString("hex");
      await Invitation.create({
        trip: trip._id, invitedBy: owner.user._id, invitedEmail: invitee.user.email,
        role: "editor", token, expiresAt: new Date(Date.now() + 86400000),
      });
      await request(app).post(`/api/trips/invitations/${token}/respond`).set(auth(invitee.token)).send({ action: "accept" });

      const list = await request(app).get(base()).set(auth(owner.token));
      const sys = list.body.messages.find((m) => m.type === "system" && m.text.includes(invitee.user.username));
      expect(sys).toBeTruthy();
      expect(sys.text).toContain("joined");
    });
  });
});
