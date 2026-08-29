import { describe, it, expect } from "vitest";
import { computeTripStatus } from "../../models/Trip.js";

const DAY = 24 * 60 * 60 * 1000;

describe("computeTripStatus", () => {
  it("returns null when both dates are missing", () => {
    expect(computeTripStatus(null, null)).toBeNull();
  });

  it("returns null when only startDate is provided", () => {
    expect(computeTripStatus(new Date(), null)).toBeNull();
  });

  it("returns null when only endDate is provided", () => {
    expect(computeTripStatus(null, new Date())).toBeNull();
  });

  it("returns upcoming when trip starts in the future", () => {
    const start = new Date(Date.now() + 2 * DAY);
    const end = new Date(Date.now() + 5 * DAY);
    expect(computeTripStatus(start, end)).toBe("upcoming");
  });

  it("returns ongoing when trip is currently active", () => {
    const start = new Date(Date.now() - DAY);
    const end = new Date(Date.now() + DAY);
    expect(computeTripStatus(start, end)).toBe("ongoing");
  });

  it("returns past when trip ended yesterday", () => {
    const start = new Date(Date.now() - 3 * DAY);
    const end = new Date(Date.now() - DAY);
    expect(computeTripStatus(start, end)).toBe("past");
  });
});
