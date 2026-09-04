import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import { searchStations } from "../utils/stations.js";

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const okJson = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe("Transport: station autocomplete (bundled dataset)", () => {
  let token;
  beforeEach(async () => { ({ token } = await createAuthUser()); });

  it("the dataset search returns real stations with coordinates (pure)", () => {
    const r = searchStations("new delhi", 8);
    expect(r.length).toBeGreaterThan(0);
    const ndls = r.find((s) => s.code === "NDLS") || r[0];
    expect(Number.isFinite(ndls.lat) && Number.isFinite(ndls.lng)).toBe(true);
    expect(ndls.label).toMatch(/\(/); // "Name (CODE)"
    expect(searchStations("a")).toHaveLength(0); // needs >= 2 chars
  });

  it("matches an exact station code", () => {
    const r = searchStations("NDLS", 5);
    expect(r[0].code).toBe("NDLS");
  });

  it("finds a city's stations even when a station isn't named after the city", () => {
    const codes = searchStations("pune", 8).map((s) => s.code);
    expect(codes).toContain("PUNE");
    expect(codes).toContain("SVJR"); // Shivajinagar — not named "Pune"
    const delhi = searchStations("delhi", 8).map((s) => s.code);
    expect(delhi).toContain("NZM"); // Hazrat Nizamuddin
  });

  it("never repeats a station across ranking buckets", () => {
    const r = searchStations("delhi", 8);
    const codes = r.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("requires auth (401)", async () => {
    expect((await request(app).get("/api/transport/stations?q=delhi")).status).toBe(401);
  });

  it("returns [] for short queries", async () => {
    const res = await request(app).get("/api/transport/stations?q=a").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.stations).toEqual([]);
  });

  it("returns matches with coords + code for a real query", async () => {
    const res = await request(app).get("/api/transport/stations?q=mumbai").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.stations.length).toBeGreaterThan(0);
    const s = res.body.stations[0];
    expect(s).toHaveProperty("code");
    expect(Number.isFinite(s.lat) && Number.isFinite(s.lng)).toBe(true);
  });
});

describe("Transport: PNR mapping", () => {
  let token;
  const OLD = process.env.RAPIDAPI_KEY;
  beforeEach(async () => { ({ token } = await createAuthUser()); process.env.RAPIDAPI_KEY = "test-key"; });
  afterEach(() => { vi.restoreAllMocks(); process.env.RAPIDAPI_KEY = OLD; });

  it("503 when no key is configured", async () => {
    delete process.env.RAPIDAPI_KEY;
    const res = await request(app).get("/api/transport/pnr?pnr=1234567890").set(auth(token));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("no_key");
  });

  it("pulls date/time/stations from the PNR and platform only when present", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okJson({
        data: {
          train_name: "Shatabdi Exp", train_no: "12001",
          boarding_point: "New Delhi", destination: "Bhopal",
          date_of_journey: "2026-10-01", departure_time: "06:00", arrival_time: "14:30",
          expected_platform: "3", class_code: "CC",
          passenger_status: [{ current_status: "CNF" }],
        },
      })
    );
    const res = await request(app).get("/api/transport/pnr?pnr=1234567890").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.pnr).toMatchObject({
      trainName: "Shatabdi Exp", trainNum: "12001",
      from: "New Delhi", to: "Bhopal",
      date: "2026-10-01", departureTime: "06:00", arrivalTime: "14:30",
      platform: "3", status: "CNF",
    });
  });

  it("omits platform when the provider doesn't return one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okJson({ train_name: "Duronto", train_no: "12213", boarding_point: "NDLS", destination: "YPR", date_of_journey: "2026-11-02" })
    );
    const res = await request(app).get("/api/transport/pnr?pnr=9999999999").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.pnr.platform).toBe("");
    expect(res.body.pnr.date).toBe("2026-11-02");
  });
});
