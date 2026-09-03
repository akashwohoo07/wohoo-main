import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import { searchAirports } from "../utils/airports.js";

describe("Airport autocomplete", () => {
  it("ranks exact IATA and city matches with coords (pure)", () => {
    const del = searchAirports("del", 5);
    expect(del[0].iata).toBe("DEL");
    expect(del[0].city).toBe("Delhi");
    expect(Number.isFinite(del[0].lat) && Number.isFinite(del[0].lng)).toBe(true);
    expect(searchAirports("mumbai", 5).some((a) => a.iata === "BOM")).toBe(true);
    expect(searchAirports("a")).toHaveLength(0); // needs >= 2 chars
  });

  it("GET /api/transport/airports requires auth and returns matches", async () => {
    expect((await request(app).get("/api/transport/airports?q=del")).status).toBe(401);
    const { token } = await createAuthUser();
    const res = await request(app).get("/api/transport/airports?q=del").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.airports[0].iata).toBe("DEL");
  });
});
