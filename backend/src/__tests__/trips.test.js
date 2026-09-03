import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Trip from "../models/Trip.js";

// Prevent real emails from being sent during tests
vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const DAY = 24 * 60 * 60 * 1000;

const sampleDestination = {
  name: "Goa",
  fullLabel: "Goa, India",
  placeId: "test-place-id",
  coordinates: { lat: 15.299, lng: 74.124 },
  city: "Panaji",
  state: "Goa",
  country: "India",
};

describe("Trips API", () => {
  describe("POST /api/trips", () => {
    it("creates a trip and returns 201", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Summer in Goa", destination: sampleDestination });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.trip.name).toBe("Summer in Goa");
    });

    it("returns 400 when name is missing", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({ destination: sampleDestination });
      expect(res.status).toBe(400);
    });

    it("returns 400 when destination is missing", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "My Trip" });
      expect(res.status).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await request(app)
        .post("/api/trips")
        .send({ name: "My Trip", destination: sampleDestination });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/trips", () => {
    it("returns upcoming and past trips for the current user", async () => {
      const { user, token } = await createAuthUser();
      // Create upcoming trip
      await Trip.create({
        name: "Next trip",
        destination: sampleDestination,
        startDate: new Date(Date.now() + 2 * DAY),
        endDate: new Date(Date.now() + 7 * DAY),
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      // Create past trip
      await Trip.create({
        name: "Old trip",
        destination: sampleDestination,
        startDate: new Date(Date.now() - 10 * DAY),
        endDate: new Date(Date.now() - 3 * DAY),
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });

      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.upcoming).toHaveLength(1);
      expect(res.body.past).toHaveLength(1);
    });

    it("does not return trips belonging to other users", async () => {
      const { token } = await createAuthUser();
      const otherUser = await createUser({ email: "other@example.com" });
      await Trip.create({
        name: "Other user trip",
        destination: sampleDestination,
        owner: otherUser._id,
        members: [{ user: otherUser._id, role: "owner" }],
      });

      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.upcoming).toHaveLength(0);
      expect(res.body.past).toHaveLength(0);
    });
  });

  describe("GET /api/trips/:id", () => {
    it("returns the trip for a member", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "My Trip",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const res = await request(app)
        .get(`/api/trips/${trip._id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.trip._id).toBe(trip._id.toString());
    });

    it("returns 403 for a non-member accessing a private trip", async () => {
      const { token } = await createAuthUser();
      const otherUser = await createUser();
      const trip = await Trip.create({
        name: "Private trip",
        destination: sampleDestination,
        isPublic: false,
        owner: otherUser._id,
        members: [{ user: otherUser._id, role: "owner" }],
      });
      const res = await request(app)
        .get(`/api/trips/${trip._id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("returns 200 for a non-member accessing a public trip", async () => {
      const { token } = await createAuthUser();
      const otherUser = await createUser();
      const trip = await Trip.create({
        name: "Public trip",
        destination: sampleDestination,
        isPublic: true,
        owner: otherUser._id,
        members: [{ user: otherUser._id, role: "owner" }],
      });
      const res = await request(app)
        .get(`/api/trips/${trip._id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 for a non-existent trip", async () => {
      const { token } = await createAuthUser();
      const res = await request(app)
        .get("/api/trips/000000000000000000000000")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/trips/:id", () => {
    it("updates trip metadata for an editor", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Original name",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const res = await request(app)
        .put(`/api/trips/${trip._id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Updated name" });
      expect(res.status).toBe(200);
      expect(res.body.trip.name).toBe("Updated name");
    });

    it("returns 403 when a viewer tries to update", async () => {
      const owner = await createUser();
      const { user: viewer, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Owner trip",
        destination: sampleDestination,
        owner: owner._id,
        members: [
          { user: owner._id, role: "owner" },
          { user: viewer._id, role: "viewer" },
        ],
      });
      const res = await request(app)
        .put(`/api/trips/${trip._id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Hacked name" });
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/trips/:id/itinerary", () => {
    it("replaces the full itinerary", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const itinerary = [
        { type: "destination", title: "Arrive in Goa", date: "2026-12-01" },
        { type: "activity", title: "Beach day", date: "2026-12-02" },
      ];
      const res = await request(app)
        .put(`/api/trips/${trip._id}/itinerary`)
        .set("Authorization", `Bearer ${token}`)
        .send({ itinerary });
      expect(res.status).toBe(200);
      expect(res.body.itinerary).toHaveLength(2);
    });

    it("persists a transport (flight) leg with its route coords", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const itinerary = [
        {
          type: "transport",
          transportMode: "flight",
          title: "6E285 · IndiGo",
          fromStation: "Delhi (DEL)",
          toStation: "Goa (GOI)",
          fromLat: 28.5665, fromLng: 77.1031,
          toLat: 15.3808, toLng: 73.8314,
          date: "2026-12-01", time: "22:45",
          bookingRef: "ABC123",
        },
      ];
      const res = await request(app)
        .put(`/api/trips/${trip._id}/itinerary`)
        .set("Authorization", `Bearer ${token}`)
        .send({ itinerary });
      expect(res.status).toBe(200);
      const leg = res.body.itinerary[0];
      expect(leg.type).toBe("transport");
      expect(leg.transportMode).toBe("flight");
      expect(leg.fromLat).toBeCloseTo(28.5665);
      expect(leg.toLng).toBeCloseTo(73.8314);
      expect(leg.bookingRef).toBe("ABC123");
    });
  });

  describe("PATCH /api/trips/:id/privacy", () => {
    it("toggles isPublic from false to true", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        isPublic: false,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const res = await request(app)
        .patch(`/api/trips/${trip._id}/privacy`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.isPublic).toBe(true);
    });
  });

  describe("POST /api/trips/:id/invite", () => {
    it("creates an invitation and returns 201", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      const res = await request(app)
        .post(`/api/trips/${trip._id}/invite`)
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "friend@example.com", role: "viewer" });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("returns 409 when the same email already has a pending invite", async () => {
      const { user, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      // First invite
      await request(app)
        .post(`/api/trips/${trip._id}/invite`)
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "friend@example.com", role: "viewer" });
      // Duplicate invite
      const res = await request(app)
        .post(`/api/trips/${trip._id}/invite`)
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "friend@example.com", role: "viewer" });
      expect(res.status).toBe(409);
    });

    it("returns 403 when a viewer tries to invite", async () => {
      const owner = await createUser();
      const { user: viewer, token } = await createAuthUser();
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: owner._id,
        members: [
          { user: owner._id, role: "owner" },
          { user: viewer._id, role: "viewer" },
        ],
      });
      const res = await request(app)
        .post(`/api/trips/${trip._id}/invite`)
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "stranger@example.com" });
      expect(res.status).toBe(403);
    });
  });

  describe("Invitation accept / decline", () => {
    async function createInvite(trip, invitedEmail, invitedBy) {
      const Invitation = (await import("../models/Invitation.js")).default;
      const crypto = await import("crypto");
      const token = crypto.default.randomBytes(32).toString("hex");
      return Invitation.create({
        trip: trip._id,
        invitedBy: invitedBy._id,
        invitedEmail,
        role: "viewer",
        token,
        expiresAt: new Date(Date.now() + 7 * DAY),
      });
    }

    it("accepts an invitation and adds user to trip members", async () => {
      const { user: owner } = await createAuthUser();
      const { user: invitee, token: inviteeToken } = await createAuthUser({
        email: "invitee@example.com",
      });
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: owner._id,
        members: [{ user: owner._id, role: "owner" }],
      });
      const invite = await createInvite(trip, invitee.email, owner);

      const res = await request(app)
        .post(`/api/trips/invitations/${invite.token}/respond`)
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ action: "accept" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Trip.findById(trip._id);
      const isMember = updated.members.some(
        (m) => m.user.toString() === invitee._id.toString()
      );
      expect(isMember).toBe(true);
    });

    it("declines an invitation", async () => {
      const { user: owner } = await createAuthUser();
      const { user: invitee, token: inviteeToken } = await createAuthUser({
        email: "invitee2@example.com",
      });
      const trip = await Trip.create({
        name: "Trip 2",
        destination: sampleDestination,
        owner: owner._id,
        members: [{ user: owner._id, role: "owner" }],
      });
      const invite = await createInvite(trip, invitee.email, owner);

      const res = await request(app)
        .post(`/api/trips/invitations/${invite.token}/respond`)
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ action: "decline" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 403 when a different user tries to accept someone else's invite", async () => {
      const { user: owner } = await createAuthUser();
      const invitee = await createUser({ email: "real-invitee@example.com" });
      const { token: imposterToken } = await createAuthUser({
        email: "imposter@example.com",
      });
      const trip = await Trip.create({
        name: "Trip",
        destination: sampleDestination,
        owner: owner._id,
        members: [{ user: owner._id, role: "owner" }],
      });
      const invite = await createInvite(trip, invitee.email, owner);

      const res = await request(app)
        .post(`/api/trips/invitations/${invite.token}/respond`)
        .set("Authorization", `Bearer ${imposterToken}`)
        .send({ action: "accept" });
      expect(res.status).toBe(403);
    });
  });
});
