import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import Notification from "../models/Notification.js";

vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `chatter${Date.now()}${n++}`.slice(0, 20);

async function makeCommunity(token, extra = {}) {
  const res = await request(app).post("/api/communities").set(auth(token)).send({ name: "Chat Room", ...extra });
  return res.body.community;
}
async function join(token, id) {
  await request(app).post(`/api/communities/${id}/join`).set(auth(token));
}

describe("Community chat", () => {
  let owner, member, community;
  beforeEach(async () => {
    owner = await createAuthUser({ username: uname() });
    member = await createAuthUser({ username: uname() });
    community = await makeCommunity(owner.token);
    await join(member.token, community._id);
  });

  const send = (token, body) =>
    request(app).post(`/api/communities/${community._id}/messages`).set(auth(token)).send(body);

  describe("send / list", () => {
    it("a member can send a text message (201)", async () => {
      const res = await send(owner.token, { text: "Hello team" });
      expect(res.status).toBe(201);
      expect(res.body.message.text).toBe("Hello team");
      expect(res.body.message.sender.username).toBe(owner.user.username);
    });

    it("rejects an empty message (400)", async () => {
      const res = await send(owner.token, { text: "   " });
      expect(res.status).toBe(400);
    });

    it("non-members cannot send (403)", async () => {
      const stranger = await createAuthUser({ username: uname() });
      const res = await send(stranger.token, { text: "let me in" });
      expect(res.status).toBe(403);
    });

    it("non-members CAN read a PUBLIC community (preview before joining)", async () => {
      const stranger = await createAuthUser({ username: uname() });
      const res = await request(app).get(`/api/communities/${community._id}/messages`).set(auth(stranger.token));
      expect(res.status).toBe(200); // public → readable
      // ...but still cannot post.
      expect((await send(stranger.token, { text: "hi" })).status).toBe(403);
    });

    it("non-members cannot read a PRIVATE community (403)", async () => {
      const priv = await makeCommunity(owner.token, { type: "private" });
      const stranger = await createAuthUser({ username: uname() });
      const res = await request(app).get(`/api/communities/${priv._id}/messages`).set(auth(stranger.token));
      expect(res.status).toBe(403);
    });

    it("lists messages chronologically with pagination", async () => {
      for (let i = 0; i < 3; i++) await send(owner.token, { text: `msg ${i}` });
      const res = await request(app).get(`/api/communities/${community._id}/messages?limit=2`).set(auth(member.token));
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      // chronological order within the page
      expect(new Date(res.body.messages[0].createdAt) <= new Date(res.body.messages[1].createdAt)).toBe(true);
    });

    it("supports ?after polling for new messages", async () => {
      const first = await send(owner.token, { text: "first" });
      const after = first.body.message.createdAt;
      await send(owner.token, { text: "second" });
      const res = await request(app)
        .get(`/api/communities/${community._id}/messages?after=${encodeURIComponent(after)}`)
        .set(auth(member.token));
      expect(res.body.messages.map((m) => m.text)).toEqual(["second"]);
    });
  });

  describe("mentions", () => {
    it("mentioning a member creates a 'mention' notification for them", async () => {
      const res = await send(owner.token, { text: `hey @${member.user.username} check this` });
      expect(res.status).toBe(201);
      expect(res.body.message.mentions.map((m) => m.username)).toContain(member.user.username);
      const notif = await Notification.findOne({ recipient: member.user._id, type: "mention" });
      expect(notif).toBeTruthy();
    });

    it("does not notify for mentioning yourself", async () => {
      await send(owner.token, { text: `note to self @${owner.user.username}` });
      const notif = await Notification.findOne({ recipient: owner.user._id, type: "mention" });
      expect(notif).toBeFalsy();
    });

    it("ignores mentions of non-members", async () => {
      const outsider = await createAuthUser({ username: uname() });
      const res = await send(owner.token, { text: `hi @${outsider.user.username}` });
      expect(res.body.message.mentions).toHaveLength(0);
      const notif = await Notification.findOne({ recipient: outsider.user._id, type: "mention" });
      expect(notif).toBeFalsy();
    });
  });

  describe("trip sharing", () => {
    async function makeTrip(user) {
      return Trip.create({
        name: "Goa 2026",
        destination: { name: "Goa", fullLabel: "Goa, India" },
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
    }

    it("shares a trip the sender belongs to and returns a trip card", async () => {
      const trip = await makeTrip(owner.user);
      const res = await send(owner.token, { type: "trip_share", tripId: trip._id, text: "join my trip!" });
      expect(res.status).toBe(201);
      expect(res.body.message.type).toBe("trip_share");
      expect(res.body.message.sharedTrip.name).toBe("Goa 2026");
    });

    it("cannot share a trip the sender is not part of (403)", async () => {
      const other = await createAuthUser({ username: uname() });
      const trip = await makeTrip(other.user);
      const res = await send(owner.token, { type: "trip_share", tripId: trip._id });
      expect(res.status).toBe(403);
    });

    it("400 when trip_share has no valid trip id", async () => {
      const res = await send(owner.token, { type: "trip_share", tripId: "not-an-id" });
      expect(res.status).toBe(400);
    });
  });

  describe("owner deletes messages", () => {
    it("owner can delete any message → tombstone flagged as admin", async () => {
      const posted = await send(member.token, { text: "oops secret" });
      const res = await request(app).delete(`/api/communities/${community._id}/messages/${posted.body.message._id}`).set(auth(owner.token));
      expect(res.status).toBe(200);
      expect(res.body.message.deleted).toBe(true);
      expect(res.body.message.deletedByAdmin).toBe(true);
      expect(res.body.message.text).toBeUndefined();

      // The content is gone from listings too.
      const list = await request(app).get(`/api/communities/${community._id}/messages`).set(auth(member.token));
      const found = list.body.messages.find((m) => m._id === posted.body.message._id);
      expect(found.deleted).toBe(true);
      expect(found.text).toBeUndefined();
    });

    it("a sender can delete their own message (not flagged admin)", async () => {
      const posted = await send(member.token, { text: "my own msg" });
      const res = await request(app).delete(`/api/communities/${community._id}/messages/${posted.body.message._id}`).set(auth(member.token));
      expect(res.status).toBe(200);
      expect(res.body.message.deleted).toBe(true);
      expect(res.body.message.deletedByAdmin).toBe(false);
    });

    it("a member cannot delete someone else's message (403)", async () => {
      const posted = await send(owner.token, { text: "keep me" });
      const res = await request(app).delete(`/api/communities/${community._id}/messages/${posted.body.message._id}`).set(auth(member.token));
      expect(res.status).toBe(403);
    });

    it("404 for a non-existent message", async () => {
      const res = await request(app).delete(`/api/communities/${community._id}/messages/507f1f77bcf86cd799439011`).set(auth(owner.token));
      expect(res.status).toBe(404);
    });

    it("surfaces deletions to pollers via `updated` (?after)", async () => {
      const target = await send(member.token, { text: "delete me" });
      const after = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 10));
      await request(app).delete(`/api/communities/${community._id}/messages/${target.body.message._id}`).set(auth(owner.token));

      const poll = await request(app)
        .get(`/api/communities/${community._id}/messages?after=${encodeURIComponent(after)}`)
        .set(auth(member.token));
      const tomb = poll.body.updated.find((m) => m._id === target.body.message._id);
      expect(tomb).toBeTruthy();
      expect(tomb.deleted).toBe(true);
    });
  });

  describe("reactions", () => {
    const react = (token, mid, emoji) =>
      request(app).post(`/api/communities/${community._id}/messages/${mid}/react`).set(auth(token)).send({ emoji });

    it("adds a reaction then toggles it off", async () => {
      const posted = await send(owner.token, { text: "nice" });
      const mid = posted.body.message._id;
      let res = await react(member.token, mid, "👍");
      expect(res.status).toBe(200);
      expect(res.body.message.reactions[0].emoji).toBe("👍");
      expect(res.body.message.reactions[0].users).toHaveLength(1);
      res = await react(member.token, mid, "👍");
      expect(res.body.message.reactions).toHaveLength(0);
    });

    it("accumulates distinct users on the same emoji", async () => {
      const posted = await send(owner.token, { text: "party" });
      const mid = posted.body.message._id;
      await react(owner.token, mid, "🔥");
      const res = await react(member.token, mid, "🔥");
      expect(res.body.message.reactions[0].users).toHaveLength(2);
    });

    it("400 for a missing emoji, 403 for a non-member", async () => {
      const posted = await send(owner.token, { text: "x" });
      const mid = posted.body.message._id;
      expect((await request(app).post(`/api/communities/${community._id}/messages/${mid}/react`).set(auth(owner.token)).send({})).status).toBe(400);
      const stranger = await createAuthUser({ username: uname() });
      expect((await react(stranger.token, mid, "😀")).status).toBe(403);
    });
  });

  describe("search", () => {
    it("finds messages by text (members only)", async () => {
      await send(owner.token, { text: "beach party at goa" });
      await send(owner.token, { text: "mountain trek" });
      const res = await request(app).get(`/api/communities/${community._id}/messages/search?q=beach`).set(auth(member.token));
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].text).toContain("beach");

      const stranger = await createAuthUser({ username: uname() });
      expect((await request(app).get(`/api/communities/${community._id}/messages/search?q=beach`).set(auth(stranger.token))).status).toBe(403);
    });
  });

  describe("system messages", () => {
    it("posts a 'joined' notice when someone joins", async () => {
      const joiner = await createAuthUser({ username: uname() });
      await join(joiner.token, community._id);
      const list = await request(app).get(`/api/communities/${community._id}/messages`).set(auth(owner.token));
      const sys = list.body.messages.find((m) => m.type === "system" && m.text.includes(joiner.user.username));
      expect(sys).toBeTruthy();
      expect(sys.text).toContain("joined");
    });

    it("posts a 'left' notice when someone leaves", async () => {
      await request(app).post(`/api/communities/${community._id}/leave`).set(auth(member.token));
      const list = await request(app).get(`/api/communities/${community._id}/messages`).set(auth(owner.token));
      const sys = list.body.messages.find((m) => m.type === "system" && m.text.includes("left"));
      expect(sys).toBeTruthy();
    });
  });

  describe("live updates via ?after", () => {
    it("returns reaction changes to existing messages in `updated`", async () => {
      const posted = await send(owner.token, { text: "old" });
      const after = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 10));
      await request(app).post(`/api/communities/${community._id}/messages/${posted.body.message._id}/react`).set(auth(member.token)).send({ emoji: "🎉" });
      const poll = await request(app).get(`/api/communities/${community._id}/messages?after=${encodeURIComponent(after)}`).set(auth(owner.token));
      const upd = poll.body.updated.find((m) => m._id === posted.body.message._id);
      expect(upd).toBeTruthy();
      expect(upd.reactions[0].emoji).toBe("🎉");
    });
  });

  describe("mark read", () => {
    it("updates lastReadAt for a member", async () => {
      const res = await request(app).patch(`/api/communities/${community._id}/read`).set(auth(member.token));
      expect(res.status).toBe(200);
    });
  });
});
