import express from "express";
import { protect } from "../middleware/auth.js";
import { searchAirports } from "../utils/airports.js";

const router = express.Router();
router.use(protect);

// ── Airport autocomplete (bundled OpenFlights data — free, offline) ─────────
// GET /api/transport/airports?q=del  → [{ iata, name, city, country, lat, lng }]
router.get("/airports", (req, res) => {
  res.json({ success: true, airports: searchAirports(req.query.q, 8) });
});

// ── Flight lookup via AviationStack (server-side, avoids CORS/403) ──────────
// GET /api/transport/flight?flightNum=6E984&date=2026-05-26
router.get("/flight", async (req, res) => {
  const { flightNum, date } = req.query;
  const key = process.env.AVIATIONSTACK_KEY;

  if (!key) {
    return res.status(503).json({ success: false, error: "no_key", message: "AVIATIONSTACK_KEY not configured on server" });
  }
  if (!flightNum || !date) {
    return res.status(400).json({ success: false, error: "missing_params", message: "flightNum and date are required" });
  }

  // Normalise: "6E-984" → "6E984", "AI 101" → "AI101"
  const clean = flightNum.replace(/[\s-]/g, "").toUpperCase();

  const fetchFlight = async (withDate) => {
    const params = new URLSearchParams({ access_key: key, flight_iata: clean, limit: "1" });
    if (withDate) params.set("flight_date", date);
    const r = await fetch(`http://api.aviationstack.com/v1/flights?${params.toString()}`);
    return r.json();
  };

  try {
    // Try the date-specific lookup (paid plans). The free plan rejects flight_date
    // with "function_access_restricted" → fall back to a real-time lookup (route +
    // schedule for that flight number). The caller's chosen date is kept for the trip.
    let data = await fetchFlight(true);
    if (data?.error?.code === "function_access_restricted") {
      data = await fetchFlight(false);
    }

    if (data.error) {
      return res.status(422).json({ success: false, error: "api_error", message: data.error.message || "AviationStack error" });
    }

    const f = data.data?.[0];
    if (!f) {
      return res.status(404).json({ success: false, error: "not_found", message: `No flight found for ${clean} on ${date}` });
    }

    return res.json({
      success: true,
      flight: {
        airline: f.airline?.name || "",
        flightNum: f.flight?.iata || clean,
        depAirport: f.departure?.airport || "",
        depIATA: f.departure?.iata || "",
        depTime: f.departure?.scheduled || "",
        depTerminal: f.departure?.terminal || "",
        depGate: f.departure?.gate || "",
        arrAirport: f.arrival?.airport || "",
        arrIATA: f.arrival?.iata || "",
        arrTime: f.arrival?.scheduled || "",
        arrTerminal: f.arrival?.terminal || "",
        status: f.flight_status || "",
        aircraft: f.aircraft?.iata || "",
      },
    });
  } catch (err) {
    console.error("AviationStack fetch error:", err);
    return res.status(500).json({ success: false, error: "network_error", message: "Failed to reach AviationStack" });
  }
});

// ── Train lookup via Indian Railways public data ─────────────────────────────
// Uses rail.kp-labs.in (free, no key) for train number/name search
// GET /api/transport/train?query=12001&searchType=number|name
router.get("/train", async (req, res) => {
  const { query, searchType } = req.query;

  if (!query) {
    return res.status(400).json({ success: false, error: "missing_params", message: "query is required" });
  }

  const clean = query.trim();

  // Try RapidAPI if key is available (better data)
  const rapidKey = process.env.RAPIDAPI_KEY;

  if (rapidKey && (searchType === "number" || searchType === "name")) {
    try {
      const endpoint = searchType === "number"
        ? `https://trains.p.rapidapi.com/v1/railways/india/trains/number/${encodeURIComponent(clean)}`
        : `https://trains.p.rapidapi.com/v1/railways/india/trains/name/${encodeURIComponent(clean)}`;

      const response = await fetch(endpoint, {
        headers: {
          "X-RapidAPI-Key": rapidKey,
          "X-RapidAPI-Host": "trains.p.rapidapi.com",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.length) {
          const t = data[0];
          return res.json({
            success: true,
            train: {
              trainName: t.train_name || t.name || "",
              trainNum: t.train_no || t.number || clean,
              from: t.from || t.source || "",
              to: t.to || t.destination || "",
              duration: t.duration || "",
              days: t.days_of_run || [],
            },
          });
        }
      }
    } catch (err) {
      console.warn("RapidAPI train lookup failed, falling back:", err.message);
    }
  }

  // Fallback: erail.in API (scrape-friendly public endpoint)
  if (searchType === "number") {
    try {
      const response = await fetch(
        `https://erail.in/rail/getTrains.aspx?TrainNo=${encodeURIComponent(clean)}&DataSource=0&Action=0&passGaurd=0`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; TripPlanner/1.0)" } }
      );
      const text = await response.text();
      // erail returns pipe-delimited: TRAINNO~TRAINNAME~FROM~TO~DEPARTURE~ARRIVAL~DURATION~...
      const lines = text.split("\n").filter(Boolean);
      if (lines.length) {
        const parts = lines[0].split("~");
        if (parts.length >= 4) {
          return res.json({
            success: true,
            train: {
              trainNum: parts[0]?.trim() || clean,
              trainName: parts[1]?.trim() || "",
              from: parts[2]?.trim() || "",
              to: parts[3]?.trim() || "",
              departure: parts[4]?.trim() || "",
              arrival: parts[5]?.trim() || "",
              duration: parts[6]?.trim() || "",
            },
          });
        }
      }
    } catch (err) {
      console.warn("erail fallback failed:", err.message);
    }
  }

  return res.status(404).json({ success: false, error: "not_found", message: `Train not found for "${clean}"` });
});

// ── PNR Status ─────────────────────────────────────────────────────────────
// GET /api/transport/pnr?pnr=1234567890
router.get("/pnr", async (req, res) => {
  const { pnr } = req.query;
  if (!pnr) return res.status(400).json({ success: false, error: "missing_params" });

  const rapidKey = process.env.RAPIDAPI_KEY;
  if (!rapidKey) {
    return res.status(503).json({ success: false, error: "no_key", message: "RAPIDAPI_KEY not configured" });
  }

  try {
    const response = await fetch(
      `https://trains.p.rapidapi.com/v1/railways/india/pnr-status/${encodeURIComponent(pnr)}`,
      {
        headers: {
          "X-RapidAPI-Key": rapidKey,
          "X-RapidAPI-Host": "trains.p.rapidapi.com",
        },
      }
    );
    if (!response.ok) throw new Error(`RapidAPI responded ${response.status}`);
    const data = await response.json();

    return res.json({
      success: true,
      pnr: {
        pnrNum: pnr,
        trainName: data.train_name || data.TrainName || "",
        trainNum: data.train_no || data.TrainNumber || "",
        from: data.boarding_point || data.BoardingPoint || "",
        to: data.destination || data.DestinationStation || "",
        date: data.date_of_journey || data.BoardingDate || "",
        classType: data.class_code || data.ClassCode || "",
        status: data.passenger_status?.[0]?.current_status || data.PassengerStatus?.[0]?.CurrentStatus || "",
        passengers: data.passenger_status || data.PassengerStatus || [],
      },
    });
  } catch (err) {
    console.error("PNR lookup error:", err);
    return res.status(500).json({ success: false, error: "api_error", message: "PNR lookup failed" });
  }
});

// ── Airport / station geocoding proxy (Nominatim, no CORS issue from server) ─
// GET /api/transport/geocode?q=DEL+airport&type=airport|station
router.get("/geocode", async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ success: false });

  const suffix = type === "station" ? " railway station" : " airport";
  const query = q.includes("airport") || q.includes("station") ? q : q + suffix;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "TripPlannerApp/1.0 (contact@yourapp.com)",
        "Accept-Language": "en",
      },
    });
    const data = await response.json();

    const preferred = data.find((p) =>
      type === "station"
        ? (p.type === "station" || p.class === "railway" || p.display_name?.toLowerCase().includes("station"))
        : (p.type === "aerodrome" || p.class === "aeroway" || p.display_name?.toLowerCase().includes("airport"))
    ) || data[0];

    if (!preferred) return res.status(404).json({ success: false, error: "not_found" });

    const a = preferred.address || {};
    const city = a.city || a.town || a.municipality || a.county || a.state || "";
    const country = a.country || "";

    return res.json({
      success: true,
      result: {
        lat: parseFloat(preferred.lat),
        lng: parseFloat(preferred.lon),
        name: preferred.name || preferred.display_name?.split(",")[0] || q,
        city,
        country,
        label: `${preferred.name || q}${city ? ", " + city : ""}`,
      },
    });
  } catch (err) {
    console.error("Geocode proxy error:", err);
    return res.status(500).json({ success: false, error: "network_error" });
  }
});

export default router;