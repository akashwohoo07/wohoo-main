import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Community from "../models/Community.js";
import CommunityMember from "../models/CommunityMember.js";
import JoinRequest from "../models/JoinRequest.js";
import Notification from "../models/Notification.js";

vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `member${Date.now()}${n++}`.slice(0, 20);

async function createCommunityAs(token, body = {}) {
  const res = await request(app).post("/api/communities").set(auth(token)).send({ name: "Goa Trippers", ...body });
  return res.body.community;
}

describe("Communities API", () => {
  let owner;
  beforeEach(async () => {
    owner = await createAuthUser({ username: uname() });
  });

  describe("create", () => {
    it("creates a public community with the owner as a member (201)", async () => {
      const res = await request(app).post("/api/communities").set(auth(owner.token)).send({ name: "Beach Lovers" });
      expect(res.status).toBe(201);
      expect(res.body.community.type).toBe("public");
      expect(res.body.community.myRole).toBe("owner");
      expect(res.body.community.membersCount).toBe(1);

      const membership = await CommunityMember.findOne({ community: res.body.community._id, user: owner.user._id });
      expect(membership.role).toBe("owner");
    });

    it("creates a private community", async () => {
      const res = await request(app).post("/api/communities").set(auth(owner.token)).send({ name: "Secret Club", type: "private" });
      expect(res.status).toBe(201);
      expect(res.body.community.type).toBe("private");
    });

    it("400 without a name", async () => {
      const res = await request(app).post("/api/communities").set(auth(owner.token)).send({});
      expect(res.status).toBe(400);
    });

    it("400 on invalid type", async () => {
      const res = await request(app).post("/api/communities").set(auth(owner.token)).send({ name: "X", type: "weird" });
      expect(res.status).toBe(400);
    });

    it("401 without auth", async () => {
      expect((await request(app).post("/api/communities").send({ name: "X" })).status).toBe(401);
    });
  });

  describe("search", () => {
    it("finds both public and private communities by name prefix", async () => {
      await createCommunityAs(owner.token, { name: "Goa Explorers" });
      await createCommunityAs(owner.token, { name: "Goa Secret", type: "private" });
      const res = await request(app).get("/api/communities/search?q=goa").set(auth(owner.token));
      expect(res.status).toBe(200);
      const names = res.body.communities.map((c) => c.name);
      expect(names).toContain("Goa Explorers");
      expect(names).toContain("Goa Secret");
    });

    it("lets a non-member find a private community and send a join request", async () => {
      const priv = await createCommunityAs(owner.token, { name: "Hidden Gems", type: "private" });
      const seeker = await createAuthUser({ username: uname() });
      const found = await request(app).get("/api/communities/search?q=hidden").set(auth(seeker.token));
      const match = found.body.communities.find((c) => c._id === priv._id);
      expect(match).toBeTruthy();
      expect(match.type).toBe("private");
      expect(match.isMember).toBe(false);
      const reqRes = await request(app).post(`/api/communities/${priv._id}/request`).set(auth(seeker.token));
      expect(reqRes.status).toBe(201);
    });
  });

  describe("mine", () => {
    it("splits owned vs joined", async () => {
      await createCommunityAs(owner.token, { name: "Owned One" });
      const other = await createAuthUser({ username: uname() });
      const pub = await createCommunityAs(other.token, { name: "Public Joinable" });
      await request(app).post(`/api/communities/${pub._id}/join`).set(auth(owner.token));

      const res = await request(app).get("/api/communities/mine").set(auth(owner.token));
      expect(res.body.owned.map((c) => c.name)).toContain("Owned One");
      expect(res.body.joined.map((c) => c.name)).toContain("Public Joinable");
    });
  });

  describe("join (public)", () => {
    let pub;
    beforeEach(async () => { pub = await createCommunityAs(owner.token, { name: "Open House" }); });

    it("lets a user join and increments membersCount", async () => {
      const joiner = await createAuthUser({ username: uname() });
      const res = await request(app).post(`/api/communities/${pub._id}/join`).set(auth(joiner.token));
      expect(res.status).toBe(201);
      const community = await Community.findById(pub._id);
      expect(community.membersCount).toBe(2);
    });

    it("409 when already a member", async () => {
      const res = await request(app).post(`/api/communities/${pub._id}/join`).set(auth(owner.token));
      expect(res.status).toBe(409);
    });
  });

  describe("private join requests", () => {
    let priv, requester;
    beforeEach(async () => {
      priv = await createCommunityAs(owner.token, { name: "Inner Circle", type: "private" });
      requester = await createAuthUser({ username: uname() });
    });

    it("403 when trying to join a private community directly", async () => {
      const res = await request(app).post(`/api/communities/${priv._id}/join`).set(auth(requester.token));
      expect(res.status).toBe(403);
    });

    it("creates a request and notifies the owner (with the request id for one-click accept)", async () => {
      const res = await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token)).send({ message: "pls" });
      expect(res.status).toBe(201);
      const notif = await Notification.findOne({ recipient: owner.user._id, type: "community_request" });
      expect(notif).toBeTruthy();
      expect(notif.request.toString()).toBe(res.body.request._id);
      expect(notif.community.toString()).toBe(priv._id.toString());
    });

    it("409 on duplicate pending request", async () => {
      await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token));
      const res = await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token));
      expect(res.status).toBe(409);
    });

    it("owner sees pending requests; a plain member cannot", async () => {
      await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token));
      const ownerView = await request(app).get(`/api/communities/${priv._id}/requests`).set(auth(owner.token));
      expect(ownerView.status).toBe(200);
      expect(ownerView.body.requests).toHaveLength(1);

      const stranger = await createAuthUser({ username: uname() });
      const strangerView = await request(app).get(`/api/communities/${priv._id}/requests`).set(auth(stranger.token));
      expect(strangerView.status).toBe(403);
    });

    it("accepting a request adds the member, bumps count, and notifies them", async () => {
      const reqRes = await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token));
      const reqId = reqRes.body.request._id;
      const res = await request(app)
        .post(`/api/communities/${priv._id}/requests/${reqId}/respond`)
        .set(auth(owner.token))
        .send({ action: "accept" });
      expect(res.status).toBe(200);

      const membership = await CommunityMember.findOne({ community: priv._id, user: requester.user._id });
      expect(membership).toBeTruthy();
      const community = await Community.findById(priv._id);
      expect(community.membersCount).toBe(2);
      const notif = await Notification.findOne({ recipient: requester.user._id, type: "community_request_accepted" });
      expect(notif).toBeTruthy();

      // The owner's request notification is cleared once handled.
      const ownerNotif = await Notification.findOne({ recipient: owner.user._id, type: "community_request", request: reqId });
      expect(ownerNotif.read).toBe(true);
    });

    it("rejecting a request does not add a member", async () => {
      const reqRes = await request(app).post(`/api/communities/${priv._id}/request`).set(auth(requester.token));
      const reqId = reqRes.body.request._id;
      await request(app).post(`/api/communities/${priv._id}/requests/${reqId}/respond`).set(auth(owner.token)).send({ action: "reject" });
      const membership = await CommunityMember.findOne({ community: priv._id, user: requester.user._id });
      expect(membership).toBeFalsy();
      const req = await JoinRequest.findById(reqId);
      expect(req.status).toBe("rejected");
    });
  });

  describe("get one", () => {
    it("returns a private community as locked for non-members", async () => {
      const priv = await createCommunityAs(owner.token, { name: "Hidden", type: "private" });
      const stranger = await createAuthUser({ username: uname() });
      const res = await request(app).get(`/api/communities/${priv._id}`).set(auth(stranger.token));
      expect(res.status).toBe(200);
      expect(res.body.locked).toBe(true);
      expect(res.body.requested).toBe(false);
    });
  });

  describe("leave & delete", () => {
    it("a member can leave and count decrements", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Leavers" });
      const joiner = await createAuthUser({ username: uname() });
      await request(app).post(`/api/communities/${pub._id}/join`).set(auth(joiner.token));
      const res = await request(app).post(`/api/communities/${pub._id}/leave`).set(auth(joiner.token));
      expect(res.status).toBe(200);
      expect((await Community.findById(pub._id)).membersCount).toBe(1);
    });

    it("owner can remove a member; count decrements and membership is gone", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Removers" });
      const member = await createAuthUser({ username: uname() });
      await request(app).post(`/api/communities/${pub._id}/join`).set(auth(member.token));

      const res = await request(app).delete(`/api/communities/${pub._id}/members/${member.user._id}`).set(auth(owner.token));
      expect(res.status).toBe(200);
      expect(await CommunityMember.findOne({ community: pub._id, user: member.user._id })).toBeNull();
      expect((await Community.findById(pub._id)).membersCount).toBe(1);
    });

    it("a non-owner cannot remove members (403)", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Guarded" });
      const m1 = await createAuthUser({ username: uname() });
      const m2 = await createAuthUser({ username: uname() });
      await request(app).post(`/api/communities/${pub._id}/join`).set(auth(m1.token));
      await request(app).post(`/api/communities/${pub._id}/join`).set(auth(m2.token));

      const res = await request(app).delete(`/api/communities/${pub._id}/members/${m2.user._id}`).set(auth(m1.token));
      expect(res.status).toBe(403);
    });

    it("owner cannot remove themselves (400) nor a non-member (404)", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Edge" });
      const self = await request(app).delete(`/api/communities/${pub._id}/members/${owner.user._id}`).set(auth(owner.token));
      expect(self.status).toBe(400);
      const stranger = await createAuthUser({ username: uname() });
      const gone = await request(app).delete(`/api/communities/${pub._id}/members/${stranger.user._id}`).set(auth(owner.token));
      expect(gone.status).toBe(404);
    });

    it("owner cannot leave (400)", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Owned" });
      const res = await request(app).post(`/api/communities/${pub._id}/leave`).set(auth(owner.token));
      expect(res.status).toBe(400);
    });

    it("owner can delete; a non-owner cannot (403)", async () => {
      const pub = await createCommunityAs(owner.token, { name: "Doomed" });
      const stranger = await createAuthUser({ username: uname() });
      expect((await request(app).delete(`/api/communities/${pub._id}`).set(auth(stranger.token))).status).toBe(403);

      const res = await request(app).delete(`/api/communities/${pub._id}`).set(auth(owner.token));
      expect(res.status).toBe(200);
      expect(await Community.findById(pub._id)).toBeNull();
      expect(await CommunityMember.countDocuments({ community: pub._id })).toBe(0);
    });
  });
});
