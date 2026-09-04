import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const okJson = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe("Transport: station autocomplete", () => {
  let token;
  beforeEach(async () => { ({ token } = await createAuthUser()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("requires auth (401)", async () => {
    expect((await request(app).get("/api/transport/stations?q=delhi")).status).toBe(401);
  });

  it("returns [] for short queries without calling out", async () => {
    const spy = vi.spyOn(global, "fetch");
    const res = await request(app).get("/api/transport/stations?q=a").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.stations).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps OSM results to {name, city, lat, lng, label} with coords", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okJson([
        {
          lat: "28.6431", lon: "77.2197",
          name: "New Delhi Railway Station",
          display_name: "New Delhi Railway Station, Delhi, India",
          namedetails: { name: "New Delhi Railway Station" },
          address: { city: "Delhi", state: "Delhi", country: "India" },
        },
        { lat: "not-a-number", lon: "x", display_name: "junk" }, // dropped (no coords)
      ])
    );
    const res = await request(app).get("/api/transport/stations?q=new+delhi").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.stations).toHaveLength(1);
    const s = res.body.stations[0];
    expect(s.name).toBe("New Delhi Railway Station");
    expect(s.city).toBe("Delhi");
    expect(s.lat).toBeCloseTo(28.6431, 3);
    expect(s.lng).toBeCloseTo(77.2197, 3);
    expect(s.label).toBe("New Delhi Railway Station, Delhi");
  });

  it("502s gracefully when the upstream fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network down"));
    const res = await request(app).get("/api/transport/stations?q=mumbai").set(auth(token));
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
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
