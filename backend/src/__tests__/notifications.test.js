import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import Notification from "../models/Notification.js";
import Invitation from "../models/Invitation.js";

// Never send real emails / enqueue jobs in tests.
vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let uname = 0;
const username = () => `user${Date.now()}${uname++}`.slice(0, 20);

const sampleDestination = { name: "Goa", fullLabel: "Goa, India" };

async function makeTrip(owner) {
  return Trip.create({
    name: "Goa Trip",
    destination: sampleDestination,
    owner: owner._id,
    members: [{ user: owner._id, role: "owner" }],
  });
}

describe("Notifications API", () => {
  it("requires auth (401)", async () => {
    expect((await request(app).get("/api/notifications")).status).toBe(401);
    expect((await request(app).get("/api/notifications/unread-count")).status).toBe(401);
  });

  it("lists only the caller's own notifications, newest-first", async () => {
    const a = await createAuthUser();
    const b = await createAuthUser();
    await Notification.create([
      { recipient: a.user._id, type: "invite_accepted", message: "old", createdAt: new Date(Date.now() - 1000) },
      { recipient: a.user._id, type: "invite_accepted", message: "new" },
      { recipient: b.user._id, type: "invite_accepted", message: "not yours" },
    ]);
    const res = await request(app).get("/api/notifications").set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0].message).toBe("new"); // newest first
  });

  it("returns the unread count", async () => {
    const a = await createAuthUser();
    await Notification.create([
      { recipient: a.user._id, type: "invite_accepted", message: "1", read: false },
      { recipient: a.user._id, type: "invite_accepted", message: "2", read: false },
      { recipient: a.user._id, type: "invite_accepted", message: "3", read: true },
    ]);
    const res = await request(app).get("/api/notifications/unread-count").set(auth(a.token));
    expect(res.body.count).toBe(2);
  });

  it("marks a single notification read", async () => {
    const a = await createAuthUser();
    const n = await Notification.create({ recipient: a.user._id, type: "invite_accepted", message: "x" });
    const res = await request(app).patch(`/api/notifications/${n._id}/read`).set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.notification.read).toBe(true);
  });

  it("cannot mark someone else's notification (404)", async () => {
    const a = await createAuthUser();
    const b = await createAuthUser();
    const n = await Notification.create({ recipient: b.user._id, type: "invite_accepted", message: "x" });
    const res = await request(app).patch(`/api/notifications/${n._id}/read`).set(auth(a.token));
    expect(res.status).toBe(404);
  });

  it("marks all read", async () => {
    const a = await createAuthUser();
    await Notification.create([
      { recipient: a.user._id, type: "invite_accepted", message: "1" },
      { recipient: a.user._id, type: "invite_accepted", message: "2" },
    ]);
    await request(app).patch("/api/notifications/read-all").set(auth(a.token));
    const count = await Notification.countDocuments({ recipient: a.user._id, read: false });
    expect(count).toBe(0);
  });

  it("paginates with a cursor", async () => {
    const a = await createAuthUser();
    for (let i = 0; i < 3; i++) {
      await Notification.create({ recipient: a.user._id, type: "invite_accepted", message: `n${i}` });
    }
    const p1 = await request(app).get("/api/notifications?limit=2").set(auth(a.token));
    expect(p1.body.notifications).toHaveLength(2);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await request(app)
      .get(`/api/notifications?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
      .set(auth(a.token));
    expect(p2.body.notifications).toHaveLength(1);
    expect(p2.body.hasMore).toBe(false);
  });
});

describe("Invite by username", () => {
  let owner, trip;
  beforeEach(async () => {
    owner = await createAuthUser({ username: username() });
    trip = await makeTrip(owner.user);
  });

  it("invites an existing user by username, creating an invite + notification", async () => {
    const invitee = await createUser({ username: username() });
    const res = await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: invitee.username, role: "editor" });
    expect(res.status).toBe(201);

    const invite = await Invitation.findOne({ trip: trip._id, invitedUser: invitee._id });
    expect(invite).toBeTruthy();
    expect(invite.invitedEmail).toBe(invitee.email);

    const notif = await Notification.findOne({ recipient: invitee._id, type: "trip_invite" });
    expect(notif).toBeTruthy();
    expect(notif.token).toBe(invite.token);
    expect(notif.trip.toString()).toBe(trip._id.toString());
  });

  it("404s for an unknown username", async () => {
    const res = await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: "nobodyhere12345" });
    expect(res.status).toBe(404);
  });

  it("400 when inviting yourself by username", async () => {
    const res = await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: owner.user.username });
    expect(res.status).toBe(400);
  });

  it("409 when the user is already a member", async () => {
    const member = await createUser({ username: username() });
    trip.members.push({ user: member._id, role: "viewer" });
    await trip.save();
    const res = await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: member.username });
    expect(res.status).toBe(409);
  });

  it("400 when neither username nor email is provided", async () => {
    const res = await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ role: "viewer" });
    expect(res.status).toBe(400);
  });

  it("emailing an existing user also creates a notification", async () => {
    const invitee = await createUser({ username: username() });
    await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ email: invitee.email });
    const notif = await Notification.findOne({ recipient: invitee._id, type: "trip_invite" });
    expect(notif).toBeTruthy();
  });

  it("emailing a non-user creates the invite but no notification", async () => {
    await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ email: "ghost@example.com" });
    const invite = await Invitation.findOne({ trip: trip._id, invitedEmail: "ghost@example.com" });
    expect(invite).toBeTruthy();
    expect(invite.invitedUser).toBeFalsy();
    const notifCount = await Notification.countDocuments({ type: "trip_invite" });
    expect(notifCount).toBe(0);
  });
});

describe("Accepting / declining from a notification", () => {
  let owner, trip, invitee;
  beforeEach(async () => {
    owner = await createAuthUser({ username: username() });
    trip = await makeTrip(owner.user);
    invitee = await createAuthUser({ username: username() });
    await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: invitee.user.username, role: "editor" });
  });

  it("accepting adds the member, clears the invite notification, and notifies the inviter", async () => {
    const notif = await Notification.findOne({ recipient: invitee.user._id, type: "trip_invite" });
    const res = await request(app)
      .post(`/api/trips/invitations/${notif.token}/respond`)
      .set(auth(invitee.token))
      .send({ action: "accept" });
    expect(res.status).toBe(200);

    const updatedTrip = await Trip.findById(trip._id);
    expect(updatedTrip.members.some((m) => m.user.toString() === invitee.user._id.toString())).toBe(true);

    // The invitee's trip_invite notification is now read.
    const cleared = await Notification.findById(notif._id);
    expect(cleared.read).toBe(true);

    // The inviter received an "accepted" notification.
    const accepted = await Notification.findOne({ recipient: owner.user._id, type: "invite_accepted" });
    expect(accepted).toBeTruthy();
  });

  it("declining notifies the inviter and does not add a member", async () => {
    const notif = await Notification.findOne({ recipient: invitee.user._id, type: "trip_invite" });
    const res = await request(app)
      .post(`/api/trips/invitations/${notif.token}/respond`)
      .set(auth(invitee.token))
      .send({ action: "decline" });
    expect(res.status).toBe(200);

    const updatedTrip = await Trip.findById(trip._id);
    expect(updatedTrip.members.some((m) => m.user.toString() === invitee.user._id.toString())).toBe(false);

    const declined = await Notification.findOne({ recipient: owner.user._id, type: "invite_declined" });
    expect(declined).toBeTruthy();
  });
});

describe("Notification action-state stays in sync (actionable / outcome)", () => {
  let owner, trip, invitee, invite;
  beforeEach(async () => {
    owner = await createAuthUser({ username: username() });
    trip = await makeTrip(owner.user);
    invitee = await createAuthUser({ username: username() });
    await request(app)
      .post(`/api/trips/${trip._id}/invite`)
      .set(auth(owner.token))
      .send({ username: invitee.user.username, role: "editor" });
    invite = await Invitation.findOne({ trip: trip._id, invitedEmail: invitee.user.email });
  });

  const listFor = async (u) => (await request(app).get("/api/notifications").set(auth(u.token))).body.notifications;

  it("a pending trip invite is actionable with no outcome", async () => {
    const [n] = await listFor(invitee);
    expect(n.type).toBe("trip_invite");
    expect(n.actionable).toBe(true);
    expect(n.outcome).toBeNull();
    expect(n.status).toBe("pending");
  });

  it("after accepting, the invite notification is no longer actionable and outcome=accepted", async () => {
    await request(app).post(`/api/trips/invitations/${invite.token}/respond`).set(auth(invitee.token)).send({ action: "accept" });
    const [n] = await listFor(invitee);
    expect(n.actionable).toBe(false);
    expect(n.outcome).toBe("accepted");
  });

  it("cancelling a pending invite resolves the invitee's notification (outcome=cancelled, read, not actionable)", async () => {
    const res = await request(app).delete(`/api/trips/${trip._id}/invitations/${invite._id}`).set(auth(owner.token));
    expect(res.status).toBe(200);
    const [n] = await listFor(invitee);
    expect(n.actionable).toBe(false);
    expect(n.outcome).toBe("cancelled");
    expect(n.read).toBe(true);
    // The invitee can no longer act on a cancelled invite.
    expect((await request(app).post(`/api/trips/invitations/${invite.token}/respond`).set(auth(invitee.token)).send({ action: "accept" })).status).toBe(404);
  });

  it("DERIVES the true state even if the persisted status is stale (invite deleted underneath)", async () => {
    // Simulate a mutation path that deleted the invite WITHOUT resolving the
    // notification — the read layer must still report it as resolved/cancelled.
    await Notification.updateOne({ invitation: invite._id }, { $set: { status: "pending", read: false } });
    await Invitation.deleteOne({ _id: invite._id });
    const [n] = await listFor(invitee);
    expect(n.actionable).toBe(false);
    expect(n.outcome).toBe("cancelled");
  });

  it("the unread badge clears after an invite is cancelled", async () => {
    await request(app).delete(`/api/trips/${trip._id}/invitations/${invite._id}`).set(auth(owner.token));
    const res = await request(app).get("/api/notifications/unread-count").set(auth(invitee.token));
    expect(res.body.count).toBe(0);
  });
});
