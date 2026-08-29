import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import { runMaintenanceJob, JOB_SYNC_TRIP_STATUS } from "../queues/maintenanceQueue.js";

const DAY = 24 * 60 * 60 * 1000;
const destination = { name: "Goa" };

// Insert a trip with a deliberately WRONG stored status (updateOne skips the
// pre-save hook, so the stale status persists — simulating an untouched trip).
async function createTripWithStatus(owner, { start, end, status }) {
  const trip = await Trip.create({
    name: "Trip",
    destination,
    startDate: start,
    endDate: end,
    owner: owner._id,
    members: [{ user: owner._id, role: "owner" }],
  });
  await Trip.updateOne({ _id: trip._id }, { $set: { status } });
  return trip;
}

describe("Trip status sync", () => {
  describe("Trip.syncAllStatuses()", () => {
    it("corrects stale stored statuses in bulk", async () => {
      const { user } = await createAuthUser();
      // Ended last week but still stored as "upcoming"
      const pastTrip = await createTripWithStatus(user, {
        start: new Date(Date.now() - 10 * DAY),
        end: new Date(Date.now() - 3 * DAY),
        status: "upcoming",
      });
      // Currently running but stored as "upcoming"
      const ongoingTrip = await createTripWithStatus(user, {
        start: new Date(Date.now() - DAY),
        end: new Date(Date.now() + DAY),
        status: "upcoming",
      });
      // Future trip stored as "past"
      const upcomingTrip = await createTripWithStatus(user, {
        start: new Date(Date.now() + 3 * DAY),
        end: new Date(Date.now() + 5 * DAY),
        status: "past",
      });

      const result = await Trip.syncAllStatuses();
      expect(result.past).toBeGreaterThanOrEqual(1);
      expect(result.ongoing).toBeGreaterThanOrEqual(1);
      expect(result.upcoming).toBeGreaterThanOrEqual(1);

      expect((await Trip.findById(pastTrip._id)).status).toBe("past");
      expect((await Trip.findById(ongoingTrip._id)).status).toBe("ongoing");
      expect((await Trip.findById(upcomingTrip._id)).status).toBe("upcoming");
    });

    it("leaves trips without dates untouched", async () => {
      const { user } = await createAuthUser();
      const trip = await Trip.create({
        name: "No dates",
        destination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });
      await Trip.updateOne({ _id: trip._id }, { $set: { status: "upcoming" } });

      await Trip.syncAllStatuses();
      expect((await Trip.findById(trip._id)).status).toBe("upcoming");
    });
  });

  describe("read path (getMyTrips)", () => {
    it("buckets by computed status even when stored status is stale, without writing", async () => {
      const { user, token } = await createAuthUser();
      // Stored "upcoming" but actually finished → should show under past, and
      // the read must NOT modify the DB.
      const trip = await createTripWithStatus(user, {
        start: new Date(Date.now() - 10 * DAY),
        end: new Date(Date.now() - 3 * DAY),
        status: "upcoming",
      });

      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.past).toHaveLength(1);
      expect(res.body.upcoming).toHaveLength(0);

      // Read path did not persist the correction (stored status still stale)
      expect((await Trip.findById(trip._id)).status).toBe("upcoming");
    });
  });

  describe("runMaintenanceJob", () => {
    it("runs the trip-status sync job", async () => {
      const result = await runMaintenanceJob(JOB_SYNC_TRIP_STATUS);
      expect(result).toHaveProperty("past");
      expect(result).toHaveProperty("ongoing");
      expect(result).toHaveProperty("upcoming");
    });

    it("throws for an unknown job", async () => {
      await expect(runMaintenanceJob("bogus")).rejects.toThrow(/Unknown maintenance job/);
    });
  });
});
