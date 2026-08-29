import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import {
  analyticsReadPreference,
  PRIMARY,
  SECONDARY_PREFERRED,
} from "../config/readPreference.js";

const destination = { name: "Goa" };

describe("Read replica routing", () => {
  afterEach(() => {
    delete process.env.USE_READ_REPLICA;
  });

  describe("analyticsReadPreference()", () => {
    it("defaults to primary when USE_READ_REPLICA is unset", () => {
      delete process.env.USE_READ_REPLICA;
      expect(analyticsReadPreference()).toBe(PRIMARY);
    });

    it("returns secondaryPreferred when USE_READ_REPLICA=true", () => {
      process.env.USE_READ_REPLICA = "true";
      expect(analyticsReadPreference()).toBe(SECONDARY_PREFERRED);
    });

    it("stays on primary for any other value", () => {
      process.env.USE_READ_REPLICA = "1";
      expect(analyticsReadPreference()).toBe(PRIMARY);
    });
  });

  describe("reads still succeed with the replica flag enabled", () => {
    it("getMyTrips works with secondaryPreferred (falls back to primary on single node)", async () => {
      process.env.USE_READ_REPLICA = "true";
      const { user, token } = await createAuthUser();
      await Trip.create({
        name: "Trip",
        destination,
        owner: user._id,
        members: [{ user: user._id, role: "owner" }],
      });

      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.upcoming.length + res.body.past.length).toBe(1);
    });

    it("user search works with the replica flag enabled", async () => {
      process.env.USE_READ_REPLICA = "true";
      const { token } = await createAuthUser();
      await createAuthUser({ username: "searchablename", email: "s@example.com" });

      const res = await request(app)
        .get("/api/users/search?q=searchable")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
    });
  });
});
