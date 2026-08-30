import { useState, useEffect, useRef } from "react";
import api from "../../api/axios";
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plane, TrainFront, Bus, MapPin, Pencil, Search, Map as MapIcon, Star, BedDouble,
} from "lucide-react";
import { TRANSPORT_ICON, TYPE_ICON, KIND_ICON, iconSvg } from "../../lib/icons.jsx";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" },
  { code: "JPY", symbol: "¥" }, { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" }, { code: "SGD", symbol: "S$" },
  { code: "AED", symbol: "د.إ" }, { code: "THB", symbol: "฿" },
];

const TRANSPORT_MODES = [
  { id: "flight", label: "Flight", icon: TRANSPORT_ICON.flight },
  { id: "train",  label: "Train",  icon: TRANSPORT_ICON.train },
  { id: "bus",    label: "Bus",    icon: TRANSPORT_ICON.bus },
  { id: "car",    label: "Car / Cab", icon: TRANSPORT_ICON.car },
  { id: "ferry",  label: "Ferry",  icon: TRANSPORT_ICON.ferry },
  { id: "metro",  label: "Metro",  icon: TRANSPORT_ICON.metro },
  { id: "bike",   label: "Bike",   icon: TRANSPORT_ICON.bike },
  { id: "walk",   label: "Walk",   icon: TRANSPORT_ICON.walk },
];

const ADD_CATEGORIES = [
  { type: "destination", label: "Destination",   icon: TYPE_ICON.destination, color: "text-rose-500 bg-rose-50 border-rose-200",     desc: "City, town or place" },
  { type: "hotel",       label: "Hotel / Stay",  icon: TYPE_ICON.hotel,       color: "text-blue-500 bg-blue-50 border-blue-200",     desc: "Accommodation" },
  { type: "restaurant",  label: "Restaurant",    icon: TYPE_ICON.restaurant,  color: "text-amber-500 bg-amber-50 border-amber-200",  desc: "Food & dining" },
  { type: "activity",    label: "Activity",      icon: TYPE_ICON.activity,    color: "text-violet-500 bg-violet-50 border-violet-200", desc: "Things to do" },
  { type: "transport",   label: "Transport",     icon: TYPE_ICON.transport,   color: "text-emerald-500 bg-emerald-50 border-emerald-200", desc: "Getting around" },
  { type: "place",       label: "Place / Sight", icon: TYPE_ICON.place,       color: "text-cyan-500 bg-cyan-50 border-cyan-200",    desc: "Museums, parks, sights" },
  { type: "shopping",    label: "Shopping",      icon: TYPE_ICON.shopping,    color: "text-pink-500 bg-pink-50 border-pink-200",    desc: "Markets & shops" },
  { type: "note",        label: "Note",          icon: TYPE_ICON.note,        color: "text-zinc-500 bg-zinc-50 border-zinc-200",     desc: "Free text note" },
  { type: "other",       label: "Other",         icon: TYPE_ICON.other,       color: "text-orange-500 bg-orange-50 border-orange-200", desc: "Anything else" },
];

const TYPE_META = Object.fromEntries(ADD_CATEGORIES.map((c) => [c.type, c]));

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function makeCid() {
  return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

const COUNTRY_CODES = {
  "india":"in","united states":"us","usa":"us","uk":"gb","united kingdom":"gb",
  "france":"fr","germany":"de","italy":"it","spain":"es","japan":"jp","china":"cn",
  "australia":"au","canada":"ca","brazil":"br","mexico":"mx","russia":"ru",
  "thailand":"th","singapore":"sg","indonesia":"id","malaysia":"my","vietnam":"vn",
  "nepal":"np","sri lanka":"lk","pakistan":"pk","bangladesh":"bd","myanmar":"mm",
  "cambodia":"kh","laos":"la","philippines":"ph","south korea":"kr","taiwan":"tw",
  "hong kong":"hk","new zealand":"nz","south africa":"za","kenya":"ke","egypt":"eg",
  "morocco":"ma","turkey":"tr","greece":"gr","portugal":"pt","netherlands":"nl",
  "belgium":"be","switzerland":"ch","austria":"at","sweden":"se","norway":"no",
  "denmark":"dk","finland":"fi","poland":"pl","czech republic":"cz","hungary":"hu",
  "romania":"ro","ukraine":"ua","israel":"il","saudi arabia":"sa","uae":"ae",
  "united arab emirates":"ae","qatar":"qa","bahrain":"bh","kuwait":"kw","oman":"om",
  "iran":"ir","iraq":"iq","jordan":"jo","lebanon":"lb","argentina":"ar","chile":"cl",
  "colombia":"co","peru":"pe","venezuela":"ve","ecuador":"ec","bolivia":"bo",
  "paraguay":"py","uruguay":"uy","cuba":"cu","jamaica":"jm",
};

function getCountryCode(countryName) {
  if (!countryName) return null;
  return COUNTRY_CODES[countryName.toLowerCase().trim()] || null;
}

function newItem(type) {
  const cid = makeCid();
  return {
    _id: cid, clientId: cid, type,
    title: "", date: "", time: "", endDate: "", endTime: "",
    price: "", currency: "INR", notes: "",
    lat: null, lng: null, placeId: "", region: "", isSubDest: false,
    transportMode: type === "transport" ? "flight" : undefined,
    fromStation: "", toStation: "", bookingRef: "",
    // coords for transport route drawing
    fromLat: null, fromLng: null, toLat: null, toLng: null,
    photo: null, rating: null, reviewCount: null, isOpen: null,
  };
}

function fmtDateShort(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getCurrencySymbol(code) {
  return CURRENCIES.find((c) => c.code === code)?.symbol || "₹";
}

// ─────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────

function useDebounce(value, delay) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

function useNominatim(query, bias = null) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const dq = useDebounce(query, 350);
  useEffect(() => {
    if (!dq || dq.length < 2) { setResults([]); return; }
    setSearching(true);
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dq)}&format=json&limit=8&addressdetails=1`;
    if (bias?.lat && bias?.lng) {
      const d = 8;
      url += `&viewbox=${bias.lng - d},${bias.lat + d},${bias.lng + d},${bias.lat - d}&bounded=0`;
    }
    if (bias?.countryCode) url += `&countrycodes=${bias.countryCode}`;
    fetch(url, { headers: { "Accept-Language": "en" } })
      .then((r) => r.json())
      .then((data) => {
        const mapped = data.map((p) => {
          const a = p.address || {};
          const city = a.city || a.town || a.village || a.municipality || a.county || null;
          const state = a.state || null;
          const country = a.country || null;
          const countryCode = a.country_code?.toUpperCase() || null;
          const primary = city || state || p.name;
          const sub = [city ? state : null, country].filter(Boolean).join(", ");
          return { primary, sub, placeId: p.place_id?.toString(), lat: parseFloat(p.lat), lng: parseFloat(p.lon), countryCode };
        }).filter((p) => p.primary);
        if (bias?.countryCode) {
          mapped.sort((a, b) => {
            const aLocal = a.countryCode === bias.countryCode.toUpperCase() ? 0 : 1;
            const bLocal = b.countryCode === bias.countryCode.toUpperCase() ? 0 : 1;
            return aLocal - bLocal;
          });
        }
        setResults(mapped);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [dq, bias?.lat, bias?.lng, bias?.countryCode]);
  return { results, searching };
}

// ── Airport geocoding via Nominatim ─────────────────────────
async function geocodeAirport(query) {
  // Try IATA code first, then name
  const searches = [
    `${query} airport`,
    query,
  ];
  for (const q of searches) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3&addressdetails=1&featuretype=aeroway`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      // Find the best airport result
      const airport = data.find(p =>
        p.type === "aerodrome" || p.class === "aeroway" ||
        p.display_name?.toLowerCase().includes("airport") ||
        p.display_name?.toLowerCase().includes("aeroporto") ||
        p.display_name?.toLowerCase().includes("aéroport")
      ) || data[0];
      if (airport) {
        const a = airport.address || {};
        const city = a.city || a.town || a.municipality || a.county || a.state || "";
        const country = a.country || "";
        return {
          lat: parseFloat(airport.lat),
          lng: parseFloat(airport.lon),
          name: airport.name || airport.display_name?.split(",")[0] || query,
          city,
          country,
          label: `${airport.name || query}${city ? ", " + city : ""}`,
        };
      }
    } catch { /* continue */ }
  }
  return null;
}

// ── Train station geocoding ─────────────────────────────────
async function geocodeStation(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + " railway station")}&format=json&limit=3&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const station = data.find(p =>
      p.type === "station" || p.class === "railway" ||
      p.display_name?.toLowerCase().includes("station") ||
      p.display_name?.toLowerCase().includes("junction")
    ) || data[0];
    if (station) {
      const a = station.address || {};
      const city = a.city || a.town || a.municipality || a.state || "";
      return {
        lat: parseFloat(station.lat),
        lng: parseFloat(station.lon),
        name: station.name || station.display_name?.split(",")[0] || query,
        city,
        label: `${station.name || query}${city ? ", " + city : ""}`,
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Shared Unsplash photo cache ──────────────────────────────
const _photoCache = {};
async function fetchHotelPhoto(query) {
  const cacheKey = `photo:${query}`;
  if (_photoCache[cacheKey] !== undefined) return _photoCache[cacheKey];
  const key = import.meta.env.VITE_UNSPLASH_KEY;
  if (!key) { _photoCache[cacheKey] = null; return null; }
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + " hotel")}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    const data = await res.json();
    const url = data?.results?.[0]?.urls?.small || null;
    _photoCache[cacheKey] = url;
    return url;
  } catch {
    _photoCache[cacheKey] = null;
    return null;
  }
}

function parseOsmAmenities(tags = {}) {
  const list = [];
  if (tags.internet_access === "wlan" || tags.wifi === "yes") list.push("WiFi");
  if (tags.parking === "yes") list.push("Parking");
  if (tags.swimming_pool === "yes" || tags.pool === "yes") list.push("Pool");
  if (tags.restaurant === "yes") list.push("Restaurant");
  if (tags.gym === "yes" || tags.fitness_centre === "yes") list.push("Gym");
  if (tags.spa === "yes") list.push("Spa");
  if (tags.air_conditioning === "yes") list.push("A/C");
  if (tags.breakfast === "yes") list.push("Breakfast");
  return list;
}

function useHotelSearch(query, bias = null) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const dq = useDebounce(query, 450);

  useEffect(() => {
    if (!dq || dq.length < 2) { setResults([]); return; }
    setSearching(true);
    let cancelled = false;

    const run = async () => {
      try {
        let hotels = [];
        if (bias?.lat && bias?.lng) {
          const radius = 25000;
          const q = `[out:json][timeout:15];(node["tourism"="hotel"]["name"~"${dq}",i](around:${radius},${bias.lat},${bias.lng});node["tourism"="hostel"]["name"~"${dq}",i](around:${radius},${bias.lat},${bias.lng});node["tourism"="guest_house"]["name"~"${dq}",i](around:${radius},${bias.lat},${bias.lng});node["tourism"="resort"]["name"~"${dq}",i](around:${radius},${bias.lat},${bias.lng});way["tourism"="hotel"]["name"~"${dq}",i](around:${radius},${bias.lat},${bias.lng}););out body center 12;`;
          const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: `data=${encodeURIComponent(q)}`,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
          const data = await res.json();
          hotels = (data.elements || [])
            .filter((el) => el.tags?.name)
            .map((el) => {
              const tags = el.tags || {};
              const elLat = el.lat ?? el.center?.lat;
              const elLng = el.lon ?? el.center?.lon;
              const addr = [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ");
              return {
                name: tags.name, region: addr || "", lat: elLat, lng: elLng,
                placeId: String(el.id), type: tags.tourism || "hotel",
                stars: tags.stars ? Number(tags.stars) : null,
                amenities: parseOsmAmenities(tags), photo: null,
              };
            });
          if (!hotels.length) throw new Error("overpass_empty");
        } else {
          throw new Error("no_bias");
        }
        if (cancelled) return;
        setResults(hotels);
        hotels.forEach(async (h, i) => {
          const photo = await fetchHotelPhoto(h.region ? `${h.name} ${h.region}` : h.name);
          if (cancelled) return;
          setResults((prev) => prev.map((r, j) => j === i ? { ...r, photo } : r));
        });
      } catch {
        if (cancelled) return;
        try {
          let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dq)}&format=json&limit=10&addressdetails=1`;
          if (bias?.lat && bias?.lng) {
            const d = 4;
            url += `&viewbox=${bias.lng-d},${bias.lat+d},${bias.lng+d},${bias.lat-d}&bounded=0`;
          }
          if (bias?.countryCode) url += `&countrycodes=${bias.countryCode}`;
          const res = await fetch(url, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          const KW = ["hotel","inn","resort","hostel","lodge","suites","palace","manor","villa","motel","homestay"];
          let hotels = data
            .filter((p) => {
              const cls = p.class || ""; const type = p.type || ""; const dn = p.display_name?.toLowerCase() || "";
              return cls === "tourism" || ["hotel","hostel","motel","guest_house","resort"].includes(type) || KW.some((kw) => dn.includes(kw));
            })
            .map((p) => {
              const a = p.address || {};
              const city = a.city || a.town || a.village || a.county || "";
              const country = a.country || "";
              return { name: p.name || p.display_name.split(",")[0].trim(), region: [city, country].filter(Boolean).join(", "), lat: parseFloat(p.lat), lng: parseFloat(p.lon), placeId: p.place_id?.toString(), type: p.type || "hotel", stars: null, amenities: [], photo: null };
            })
            .filter((h) => h.name)
            .slice(0, 8);
          if (cancelled) return;
          setResults(hotels);
          hotels.forEach(async (h, i) => {
            const photo = await fetchHotelPhoto(h.name);
            if (cancelled) return;
            setResults((prev) => prev.map((r, j) => j === i ? { ...r, photo } : r));
          });
        } catch { if (!cancelled) setResults([]); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [dq, bias?.lat, bias?.lng, bias?.countryCode]);

  return { results, searching };
}

// ─────────────────────────────────────────────────────────────
// FLIGHT / TRAIN SEARCH COMPONENTS
// ─────────────────────────────────────────────────────────────

// Search flight by flight number + date using AviationStack (free tier)
// Returns: { airline, flightNum, depAirport, depIATA, depTime, arrAirport, arrIATA, arrTime, status, duration }
async function searchFlight(flightNum, date) {
  const key = import.meta.env.VITE_AVIATIONSTACK_KEY;
  if (!key) return { error: "no_key" };
  // Clean: "6E-201" → "6E201", "AI 101" → "AI101"
  const clean = flightNum.replace(/[\s-]/g, "").toUpperCase();
  try {
    const url = `https://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${clean}&flight_date=${date}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return { error: data.error.message || "api_error" };
    const f = data.data?.[0];
    if (!f) return { error: "not_found" };
    return {
      airline: f.airline?.name || "",
      flightNum: f.flight?.iata || clean,
      depAirport: f.departure?.airport || "",
      depIATA: f.departure?.iata || "",
      depCity: f.departure?.timezone?.split("/")[1]?.replace("_", " ") || "",
      depTime: f.departure?.scheduled || "",
      depLat: null, depLng: null,
      arrAirport: f.arrival?.airport || "",
      arrIATA: f.arrival?.iata || "",
      arrCity: f.arrival?.timezone?.split("/")[1]?.replace("_", " ") || "",
      arrTime: f.arrival?.scheduled || "",
      arrLat: null, arrLng: null,
      status: f.flight_status || "",
      duration: null,
    };
  } catch {
    return { error: "network_error" };
  }
}

// Indian train search via IRCTC free API endpoint (rail.kp-labs.in or similar public)
// Returns basic train info by train number or PNR
async function searchTrain(query, searchType) {
  // Use a public Indian Railways data API
  // train number search: returns train name, from, to stations
  // We fall back to name-based geocoding since real PNR APIs require paid keys
  const clean = query.trim().replace(/\s+/g, "");

  if (searchType === "pnr") {
    // PNR check — use public endpoint
    try {
      const res = await fetch(`https://indianrailapi.com/api/v2/PNRCheck/apikey/your_key/PNRNumber/${clean}/`);
      // Most free endpoints are rate-limited; we parse what we get
      const data = await res.json();
      if (data.ResponseCode === "200" && data.Pnr) {
        return {
          trainName: data.TrainName || "",
          trainNum: data.TrainNumber || "",
          from: data.BoardingPoint || data.SourceStation || "",
          to: data.DestinationStation || "",
          date: data.BoardingDate || "",
          status: data.PassengerStatus?.[0]?.CurrentStatus || "",
          classType: data.ClassCode || "",
        };
      }
    } catch { /* fall through */ }
    return { error: "pnr_unavailable" };
  }

  // Train number / name search — use public trainman/erail-style API
  // We use a CORS-friendly public search
  try {
    const res = await fetch(
      `https://trains.p.rapidapi.com/v1/railways/india/trains/name/${encodeURIComponent(query)}`,
      {
        headers: {
          "X-RapidAPI-Key": import.meta.env.VITE_RAPIDAPI_KEY || "",
          "X-RapidAPI-Host": "trains.p.rapidapi.com",
        },
      }
    );
    if (!res.ok) throw new Error("api_error");
    const data = await res.json();
    if (data?.length) {
      const t = data[0];
      return {
        trainName: t.train_name || t.name || "",
        trainNum: t.train_no || t.number || "",
        from: t.from || t.source || "",
        to: t.to || t.destination || "",
        days: t.days_of_run || [],
        duration: t.duration || "",
      };
    }
  } catch { /* fall through */ }
  return { error: "not_found" };
}

// ── Flight Search Panel ────────────────────────────────────
function FlightSearchPanel({ onFill, initialFlightNum = "", initialDate = "" }) {
  const [flightNum, setFlightNum] = useState(initialFlightNum);
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);

  const hasKey = !!import.meta.env.VITE_AVIATIONSTACK_KEY;

  const handleSearch = async () => {
    if (!flightNum.trim() || !date) return;
    setLoading(true);
    setError("");
    setResult(null);
    const data = await searchFlight(flightNum, date);
    setLoading(false);
    if (data.error) {
      if (data.error === "no_key") {
        setError("Add VITE_AVIATIONSTACK_KEY to .env to enable live flight lookup.");
      } else if (data.error === "not_found") {
        setError("Flight not found. Check the flight number and date.");
      } else {
        setError("Could not fetch flight data. Try again.");
      }
      return;
    }
    setResult(data);
  };

  const handleUse = async () => {
    if (!result) return;
    setResolving(true);
    // Geocode both airports to get coordinates for the arc
    const [dep, arr] = await Promise.all([
      geocodeAirport(result.depIATA || result.depAirport),
      geocodeAirport(result.arrIATA || result.arrAirport),
    ]);
    setResolving(false);

    const depTime = result.depTime ? new Date(result.depTime).toTimeString().slice(0, 5) : "";
    const arrTime = result.arrTime ? new Date(result.arrTime).toTimeString().slice(0, 5) : "";
    const depDate = result.depTime ? new Date(result.depTime).toISOString().split("T")[0] : date;
    const arrDate = result.arrTime ? new Date(result.arrTime).toISOString().split("T")[0] : date;

    onFill({
      title: `${result.flightNum}${result.airline ? " · " + result.airline : ""}`,
      fromStation: dep?.label || result.depAirport || result.depIATA,
      toStation: arr?.label || result.arrAirport || result.arrIATA,
      fromLat: dep?.lat || null,
      fromLng: dep?.lng || null,
      toLat: arr?.lat || null,
      toLng: arr?.lng || null,
      date: depDate,
      time: depTime,
      endDate: arrDate,
      endTime: arrTime,
      notes: [
        result.airline ? `Flight: ${result.airline} — ${result.flightNum}` : "",
        result.status ? `Status: ${result.status}` : "",
      ].filter(Boolean).join("\n"),
    });
  };

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Plane className="w-5 h-5 text-sky-700" />
        <p className="text-sm font-semibold text-sky-800">Search by flight number</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1 block">Flight No.</label>
          <input
            value={flightNum}
            onChange={(e) => setFlightNum(e.target.value.toUpperCase())}
            placeholder="e.g. 6E-201, AI101"
            className="w-full text-sm border border-sky-200 focus:border-sky-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1 block">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs border border-sky-200 focus:border-sky-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700"
          />
        </div>
      </div>

      <button
        onClick={handleSearch}
        disabled={loading || !flightNum.trim() || !date}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {loading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {loading ? "Searching..." : "Look up flight"}
      </button>

      {!hasKey && !error && (
        <p className="text-[11px] text-sky-600 text-center">
          Live lookup needs <code className="bg-sky-100 px-1 rounded">VITE_AVIATIONSTACK_KEY</code> in .env
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-sky-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-800">{result.flightNum}</p>
              {result.airline && <p className="text-[11px] text-zinc-400">{result.airline}</p>}
            </div>
            {result.status && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                result.status === "active" ? "bg-green-100 text-green-700" :
                result.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                result.status === "landed" ? "bg-zinc-100 text-zinc-600" :
                "bg-amber-100 text-amber-700"
              }`}>
                {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-zinc-900">{result.depIATA || "—"}</p>
              <p className="text-[10px] text-zinc-500 truncate">{result.depAirport}</p>
              {result.depTime && <p className="text-[11px] font-semibold text-zinc-700 mt-0.5">{new Date(result.depTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
            <div className="flex-shrink-0 text-center">
              <div className="flex items-center gap-1">
                <div className="w-6 h-px bg-zinc-300" />
                <Plane className="w-3 h-3 text-zinc-400" />
                <div className="w-6 h-px bg-zinc-300" />
              </div>
            </div>
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-zinc-900">{result.arrIATA || "—"}</p>
              <p className="text-[10px] text-zinc-500 truncate">{result.arrAirport}</p>
              {result.arrTime && <p className="text-[11px] font-semibold text-zinc-700 mt-0.5">{new Date(result.arrTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
          </div>

          <button
            onClick={handleUse}
            disabled={resolving}
            className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {resolving && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {resolving ? "Resolving airports..." : "Use this flight →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Train Search Panel ─────────────────────────────────────
function TrainSearchPanel({ onFill, initialQuery = "", initialDate = "" }) {
  const [searchType, setSearchType] = useState("number"); // "number" | "pnr" | "name"
  const [query, setQuery] = useState(initialQuery);
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);

  const SEARCH_TYPES = [
    { id: "number", label: "Train No.", placeholder: "e.g. 12001, 22691" },
    { id: "pnr",    label: "PNR",       placeholder: "10-digit PNR number" },
    { id: "name",   label: "Train Name", placeholder: "e.g. Shatabdi, Rajdhani" },
  ];

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    const data = await searchTrain(query, searchType);
    setLoading(false);
    if (data.error) {
      if (data.error === "pnr_unavailable") {
        setError("Live PNR lookup needs VITE_RAPIDAPI_KEY. You can still fill details manually below.");
      } else if (data.error === "not_found") {
        setError("Train not found. Try searching by name or number.");
      } else {
        setError("Could not fetch train data.");
      }
      return;
    }
    setResult(data);
  };

  // Manual fill without API
  const handleManualFill = () => {
    onFill({
      title: query,
      fromStation: "",
      toStation: "",
      bookingRef: searchType === "pnr" ? query : "",
      date: date || "",
      notes: searchType === "pnr" ? `PNR: ${query}` : `Train: ${query}`,
    });
  };

  const handleUse = async () => {
    if (!result) return;
    setResolving(true);
    const [from, to] = await Promise.all([
      geocodeStation(result.from || ""),
      geocodeStation(result.to || ""),
    ]);
    setResolving(false);

    onFill({
      title: result.trainNum ? `${result.trainName || ""} (${result.trainNum})`.trim() : result.trainName || query,
      fromStation: from?.label || result.from || "",
      toStation: to?.label || result.to || "",
      fromLat: from?.lat || null,
      fromLng: from?.lng || null,
      toLat: to?.lat || null,
      toLng: to?.lng || null,
      date: result.date || date || "",
      bookingRef: searchType === "pnr" ? query : "",
      notes: [
        result.trainNum ? `Train: ${result.trainName} — ${result.trainNum}` : "",
        result.classType ? `Class: ${result.classType}` : "",
        result.status ? `Status: ${result.status}` : "",
        result.duration ? `Duration: ${result.duration}` : "",
      ].filter(Boolean).join("\n"),
    });
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <TrainFront className="w-5 h-5 text-amber-700" />
        <p className="text-sm font-semibold text-amber-800">Search train</p>
      </div>

      {/* Search type toggle */}
      <div className="flex gap-1 bg-amber-100 p-1 rounded-xl">
        {SEARCH_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSearchType(t.id); setQuery(""); setResult(null); setError(""); }}
            className={`flex-1 text-[11px] font-semibold py-1 rounded-lg transition-all ${
              searchType === t.id ? "bg-white text-amber-800 shadow-sm" : "text-amber-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_TYPES.find(t => t.id === searchType)?.placeholder}
            className="w-full text-sm border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300"
          />
        </div>
        {searchType !== "pnr" && (
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">Travel Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-xs border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {loading ? "Searching..." : "Look up"}
        </button>
        <button
          onClick={handleManualFill}
          className="px-3 py-2 border border-amber-300 text-amber-700 text-xs font-medium rounded-xl hover:bg-amber-100 transition-all"
        >
          Fill manually
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
          <div>
            <p className="text-sm font-bold text-zinc-800">{result.trainName}</p>
            {result.trainNum && <p className="text-[11px] text-zinc-400">Train #{result.trainNum}</p>}
          </div>
          {(result.from || result.to) && (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">From</p>
                <p className="text-xs font-semibold text-zinc-800">{result.from || "—"}</p>
              </div>
              <span className="text-zinc-400 text-xs inline-flex items-center gap-1"><TrainFront className="w-3 h-3" />→</span>
              <div className="flex-1 text-right">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">To</p>
                <p className="text-xs font-semibold text-zinc-800">{result.to || "—"}</p>
              </div>
            </div>
          )}
          {result.status && (
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {result.status}
            </span>
          )}
          <button
            onClick={handleUse}
            disabled={resolving}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {resolving && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {resolving ? "Resolving stations..." : "Use this train →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED FORM COMPONENTS
// ─────────────────────────────────────────────────────────────

function LocationField({ label, value, onChange, onSelect, placeholder, bias }) {
  const { results, searching } = useNominatim(value, bias);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleSelect = (r) => {
    setOpen(false);
    onSelect(r);
  };

  return (
    <div className="relative" ref={ref}>
      {label && <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">{label}</label>}
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search location..."}
        className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300 transition-colors"
      />
      {open && value.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 overflow-hidden max-h-44 overflow-y-auto">
          {searching && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400">
              <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />
              Searching...
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-zinc-400">No results found</div>
          )}
          {results.map((r, i) => (
            <button key={i}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors text-left">
              <div className="w-5 h-5 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-800 truncate">{r.primary}</p>
                {r.sub && <p className="text-[11px] text-zinc-400 truncate">{r.sub}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HotelSearchField({ value, onChange, onSelect, bias }) {
  const { results, searching } = useHotelSearch(value, bias);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleSelect = (r) => {
    setOpen(false);
    onSelect(r);
  };

  const typeBadge = (t) => {
    const map = { hostel: { label: "Hostel", color: "bg-violet-50 text-violet-600" }, motel: { label: "Motel", color: "bg-zinc-100 text-zinc-500" }, resort: { label: "Resort", color: "bg-emerald-50 text-emerald-600" }, guest_house: { label: "Guesthouse", color: "bg-amber-50 text-amber-600" }, apartment: { label: "Apartment", color: "bg-blue-50 text-blue-600" } };
    return map[t] || { label: "Hotel", color: "bg-rose-50 text-rose-500" };
  };

  return (
    <div className="relative" ref={ref}>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Search hotel / property</label>
      <div className="flex items-center gap-2 border-b border-zinc-200 focus-within:border-rose-400 transition-colors pb-1">
        <svg className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="e.g. The Oberoi Delhi, Zostel Manali..."
          className="flex-1 text-sm outline-none py-1 text-zinc-700 bg-transparent placeholder-zinc-300"
          autoComplete="off"
        />
        {searching && <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin flex-shrink-0" />}
      </div>

      {open && value.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[280px] overflow-y-auto">
          {searching && results.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
              <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />
              Searching near your destination...
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-zinc-400">
              No properties found — try adding the city name (e.g. "Oberoi Delhi")
            </div>
          )}
          {results.map((r, i) => {
            const badge = typeBadge(r.type);
            return (
              <button key={i}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 transition-colors text-left border-b border-zinc-50 last:border-0">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 flex items-center justify-center">
                  {r.photo
                    ? <img src={r.photo} alt={r.name} className="w-full h-full object-cover" />
                    : <BedDouble className="w-5 h-5 text-zinc-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate leading-tight">{r.name}</p>
                  {r.region && <p className="text-[11px] text-zinc-400 truncate mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.region}</p>}
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              </button>
            );
          })}
          {!searching && value.length >= 2 && (
            <button
              onMouseDown={(e) => { e.preventDefault(); handleSelect({ name: value, region: "", lat: null, lng: null, placeId: "" }); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 transition-colors text-left border-t border-zinc-100">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                <Pencil className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700">Add "{value}" manually</p>
                <p className="text-[11px] text-zinc-400">Without map pin or photo</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PriceField({ price, currency, onPriceChange, onCurrencyChange }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Price (optional)</label>
      <div className="flex items-center gap-2">
        <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}
          className="text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-600 bg-transparent">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
        <input type="number" min="0" value={price} onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Amount"
          className="flex-1 text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
      </div>
    </div>
  );
}

function DTPair({ label, date, time, onDate, onTime, minDate, maxDate, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">{label}</label>
        <input type="date" value={date} min={minDate} max={maxDate} disabled={disabled}
          onChange={(e) => onDate(e.target.value)}
          className="w-full text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent disabled:opacity-40" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Time (opt.)</label>
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} disabled={disabled}
          className="w-full text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent disabled:opacity-40" />
      </div>
    </div>
  );
}

function NotesField({ value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Notes (optional)</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent resize-none placeholder-zinc-300" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLACE SEARCH DRAWER
// ─────────────────────────────────────────────────────────────

const SEARCHABLE_TYPES = {
  hotel:      { kind: "stays",      icon: KIND_ICON.stays,      label: "Hotels & Stays",    color: "bg-blue-50 border-blue-200 text-blue-700" },
  restaurant: { kind: "eats",       icon: KIND_ICON.eats,       label: "Restaurants & Cafes", color: "bg-amber-50 border-amber-200 text-amber-700" },
  activity:   { kind: "activities", icon: KIND_ICON.activities, label: "Activities",         color: "bg-violet-50 border-violet-200 text-violet-700" },
  place:      { kind: "sights",     icon: KIND_ICON.sights,     label: "Sights & Museums",  color: "bg-cyan-50 border-cyan-200 text-cyan-700" },
};

function StarRow({ rating, count }) {
  if (!rating) return null;
  const r = parseFloat(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} className={`w-2.5 h-2.5 ${i < Math.round(r) ? "text-amber-400" : "text-zinc-200"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        ))}
      </div>
      <span className="text-[10px] font-bold text-zinc-600">{r.toFixed(1)}</span>
      {count && <span className="text-[10px] text-zinc-400">({count >= 1000 ? (count/1000).toFixed(1)+"k" : count})</span>}
    </div>
  );
}

function PlaceSearchDrawer({ type, tripDestination, onSelect, onClose }) {
  const meta = SEARCHABLE_TYPES[type];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const coords = tripDestination?.coordinates;

  useEffect(() => {
    inputRef.current?.focus();
    if (coords?.lat && meta) {
      doSearch("");
    }
  }, []);

  const doSearch = async (q) => {
    if (!coords?.lat) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get("/explore/search", {
        params: { ll: `${coords.lat},${coords.lng}`, kind: meta.kind, query: q || undefined, radius: 5000 },
      });
      setResults(res.data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 600);
  };

  const handlePick = (place) => {
    onSelect({
      title: place.name,
      region: place.address || "",
      lat: place.lat,
      lng: place.lng,
      placeId: place.id,
      notes: [
        place.description || "",
        place.hours ? `Hours: ${place.hours.split("\n")[0]}` : "",
        place.website ? `Website: ${place.website}` : "",
        place.phone ? `Phone: ${place.phone}` : "",
        place.rating ? `Rating: ${place.rating} (${place.reviewCount || 0} reviews)` : "",
      ].filter(Boolean).join("\n"),
      photo: place.photo || null,
      rating: place.rating || null,
      reviewCount: place.reviewCount || null,
      isOpen: place.isOpen,
    });
  };

  const PRICE_LABELS = ["", "₹", "₹₹", "₹₹₹", "₹₹₹₹"];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-0 sm:px-4"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-zinc-100 flex-shrink-0">
          {meta?.icon && <meta.icon className="w-5 h-5 text-zinc-700" />}
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-800">{meta?.label}</p>
            <p className="text-[11px] text-zinc-400">
              {coords?.lat ? `Near ${tripDestination?.name || "your destination"}` : "Search anywhere"}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-zinc-100 flex-shrink-0">
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 focus-within:border-rose-400 rounded-xl px-3 py-2 transition-colors">
            <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={`Search ${meta?.label?.toLowerCase() || "places"}...`}
              className="flex-1 text-sm outline-none bg-transparent text-zinc-700 placeholder-zinc-400"
            />
            {loading && <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin flex-shrink-0"/>}
          </div>
          {!coords?.lat && (
            <p className="text-[11px] text-zinc-400 mt-1.5 text-center">
              Add a destination to your trip to see nearby results
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="space-y-0 divide-y divide-zinc-50">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-14 h-14 bg-zinc-100 rounded-xl flex-shrink-0"/>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-zinc-100 rounded w-3/4"/>
                    <div className="h-3 bg-zinc-100 rounded w-1/2"/>
                    <div className="h-3 bg-zinc-100 rounded w-1/3"/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
              <Search className="w-8 h-8 text-zinc-300" strokeWidth={1.5} />
              <p className="text-sm text-zinc-500">No results found</p>
              <p className="text-xs text-zinc-400">Try a different search term</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="divide-y divide-zinc-50">
              {results.map((place) => (
                <button
                  key={place.id}
                  onClick={() => handlePick(place)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 flex items-center justify-center">
                    {place.photo ? (
                      <img src={place.photo} alt={place.name} className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display="none"; }}/>
                    ) : (
                      meta?.icon && <meta.icon className="w-6 h-6 text-zinc-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate leading-tight">{place.name}</p>
                    {place.address && <p className="text-[11px] text-zinc-400 truncate mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" /> {place.address}</p>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StarRow rating={place.rating} count={place.reviewCount} />
                      {place.price && <span className="text-[10px] text-zinc-500">{PRICE_LABELS[place.price]}</span>}
                      {place.isOpen !== null && (
                        <span className={`text-[10px] font-semibold ${place.isOpen ? "text-green-600" : "text-red-500"}`}>
                          {place.isOpen ? "● Open" : "● Closed"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-7 h-7 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0 text-rose-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD MENU
// ─────────────────────────────────────────────────────────────

function AddMenu({ onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref}
      className="absolute left-0 z-40 bg-white rounded-2xl shadow-2xl border border-zinc-100 py-2 w-[248px] overflow-hidden"
      style={{ top: "calc(100% + 4px)" }}>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-4 pt-1 pb-2">Add to itinerary</p>
      {ADD_CATEGORIES.map((cat) => {
        const CatIcon = cat.icon;
        return (
        <button key={cat.type}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cat.type); }}
          className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 transition-colors text-left">
          <span className={`w-7 h-7 flex items-center justify-center rounded-lg border flex-shrink-0 ${cat.color}`}><CatIcon className="w-4 h-4" /></span>
          <div>
            <p className="text-sm font-medium text-zinc-800 leading-tight">{cat.label}</p>
            <p className="text-[11px] text-zinc-400">{cat.desc}</p>
          </div>
        </button>
        );
      })}
    </div>
  );
}

function AddButton({ onSelect, canEdit }) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return <div className="h-1" />;
  return (
    <div className="relative flex items-center gap-2 group/add py-1 px-2">
      <button onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all flex-shrink-0 ${
          open ? "border-rose-400 bg-rose-50 text-rose-500"
               : "border-zinc-200 text-zinc-300 hover:border-rose-300 hover:text-rose-400 hover:bg-rose-50/50"
        }`}>
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <div className={`flex-1 h-px transition-colors ${open ? "bg-rose-200" : "bg-zinc-100 group-hover/add:bg-zinc-200"}`} />
      {open && <AddMenu onSelect={(t) => { setOpen(false); onSelect(t); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ITEM DETAIL MODAL
// ─────────────────────────────────────────────────────────────

function ItemModal({ item, tripStartDate, tripEndDate, tripDestination, onSave, onClose }) {
  const [form, setForm] = useState({ ...item });
  const minDate = tripStartDate ? new Date(tripStartDate).toISOString().split("T")[0] : "";
  const maxDate = tripEndDate ? new Date(tripEndDate).toISOString().split("T")[0] : "";
  const meta = TYPE_META[item.type] || TYPE_META.other;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const bias = tripDestination?.coordinates?.lat
    ? { lat: tripDestination.coordinates.lat, lng: tripDestination.coordinates.lng, countryCode: getCountryCode(tripDestination.country) }
    : null;

  // Transport: which search tab is active
  const [transportSearch, setTransportSearch] = useState("manual"); // "manual" | "flight" | "train"

  const canSave = item.type === "note"
    ? (form.notes?.trim() || form.title?.trim())
    : form.title?.trim() || (item.type === "transport" && (form.fromStation?.trim() || form.toStation?.trim()));

  const handleSave = () => {
    if (!canSave) return;
    const title = form.title?.trim() ||
      (item.type === "transport" && form.fromStation && form.toStation
        ? `${form.fromStation} → ${form.toStation}` : "") ||
      form.notes?.slice(0, 40) || "Untitled";
    onSave({ ...form, title, clientId: form.clientId || form._id || makeCid() });
  };

  // Called when flight/train search fills in data
  const handleSearchFill = (data) => {
    setForm((f) => ({ ...f, ...data }));
    setTransportSearch("manual");
  };

  const tm = TRANSPORT_MODES.find((m) => m.id === form.transportMode);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
          {(() => {
            const HeadIcon = item.type === "transport" && tm ? tm.icon : meta.icon;
            return (
              <span className={`w-9 h-9 flex items-center justify-center rounded-xl border flex-shrink-0 ${meta.color}`}>
                <HeadIcon style={{ width: 18, height: 18 }} />
              </span>
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-800">{meta.label}</p>
            <p className="text-[11px] text-zinc-400">{meta.desc}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ── DESTINATION ── */}
          {item.type === "destination" && <>
            <LocationField label="Destination" value={form.title} onChange={(v) => set("title", v)}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub }))}
              placeholder="Search city, town, place..." />
            {form.lat && <p className="text-[11px] text-zinc-400 -mt-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
            <DTPair label="Arrival" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Departure" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Things to remember about this place..." />
          </>}

          {/* ── HOTEL ── */}
          {item.type === "hotel" && <>
            <HotelSearchField value={form.title} onChange={(v) => set("title", v)} bias={bias}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.name, region: r.region || f.region, lat: r.lat ?? f.lat, lng: r.lng ?? f.lng, placeId: r.placeId || f.placeId }))} />
            {form.title && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <BedDouble className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 truncate">{form.title}</p>
                  {form.region && <p className="text-[11px] text-zinc-500 truncate inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
                </div>
                <button onClick={() => setForm((f) => ({ ...f, title: "", region: "", lat: null, lng: null, placeId: "" }))}
                  className="text-zinc-300 hover:text-zinc-500 transition-colors flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <DTPair label="Check-in" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Check-out" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Booking reference</label>
              <input value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="Confirmation / booking ID"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Room type, amenities, contact info..." />
          </>}

          {/* ── RESTAURANT ── */}
          {item.type === "restaurant" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Restaurant name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Bukhara, local dhaba..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Area / Address" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Search area or address..." />
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Cuisine, reservation, must-try dishes..." />
          </>}

          {/* ── ACTIVITY ── */}
          {item.type === "activity" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Activity name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Paragliding, Temple visit, Trek..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Location" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Where does it happen?" />
            <DTPair label="Start" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="End" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="What to carry, booking link, operator details..." />
          </>}

          {/* ── TRANSPORT ── */}
          {item.type === "transport" && <>
            {/* Mode picker */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Mode of transport</label>
              <div className="flex flex-wrap gap-1.5">
                {TRANSPORT_MODES.map((m) => {
                  const ModeIcon = m.icon;
                  return (
                  <button key={m.id} type="button"
                    onClick={() => {
                      set("transportMode", m.id);
                      // Reset search tab when mode changes
                      if (m.id !== "flight" && m.id !== "train") setTransportSearch("manual");
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      form.transportMode === m.id
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                    }`}>
                    <ModeIcon className="w-3.5 h-3.5" /> {m.label}
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Smart lookup tabs — only for flight and train */}
            {(form.transportMode === "flight" || form.transportMode === "train") && (
              <div>
                <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl mb-3">
                  <button
                    onClick={() => setTransportSearch("manual")}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all ${
                      transportSearch === "manual" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500"
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Manual
                  </button>
                  {form.transportMode === "flight" && (
                    <button
                      onClick={() => setTransportSearch("flight")}
                      className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${
                        transportSearch === "flight" ? "bg-white text-sky-700 shadow-sm" : "text-zinc-500"
                      }`}
                    >
                      <span className="inline-flex items-center justify-center gap-1.5"><Plane className="w-3.5 h-3.5" /> By flight no.</span>
                    </button>
                  )}
                  {form.transportMode === "train" && (
                    <button
                      onClick={() => setTransportSearch("train")}
                      className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${
                        transportSearch === "train" ? "bg-white text-amber-700 shadow-sm" : "text-zinc-500"
                      }`}
                    >
                      <span className="inline-flex items-center justify-center gap-1.5"><TrainFront className="w-3.5 h-3.5" /> Search train</span>
                    </button>
                  )}
                </div>

                {transportSearch === "flight" && form.transportMode === "flight" && (
                  <FlightSearchPanel
                    onFill={handleSearchFill}
                    initialFlightNum={form.title}
                    initialDate={form.date}
                  />
                )}
                {transportSearch === "train" && form.transportMode === "train" && (
                  <TrainSearchPanel
                    onFill={handleSearchFill}
                    initialQuery={form.title || form.bookingRef}
                    initialDate={form.date}
                  />
                )}
              </div>
            )}

            {/* Manual fields (always visible, pre-filled by search) */}
            {transportSearch === "manual" && (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">
                    {form.transportMode === "flight" ? "Departure airport / city" : form.transportMode === "train" ? "Departure station / city" : "From"}
                  </label>
                  <input value={form.fromStation} onChange={(e) => set("fromStation", e.target.value)}
                    placeholder={form.transportMode === "flight" ? "e.g. Delhi (DEL) / IGI Airport" : form.transportMode === "train" ? "e.g. New Delhi / NDLS" : "Departure point"}
                    className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">
                    {form.transportMode === "flight" ? "Arrival airport / city" : form.transportMode === "train" ? "Arrival station / city" : "To"}
                  </label>
                  <input value={form.toStation} onChange={(e) => set("toStation", e.target.value)}
                    placeholder={form.transportMode === "flight" ? "e.g. Mumbai (BOM) / CSIA" : form.transportMode === "train" ? "e.g. Chandigarh / CDG" : "Arrival point"}
                    className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Service / flight / train name</label>
                  <input value={form.title} onChange={(e) => set("title", e.target.value)}
                    placeholder={
                      form.transportMode === "flight" ? "e.g. IndiGo 6E-201" :
                      form.transportMode === "train" ? "e.g. Shatabdi Express 12001" :
                      form.transportMode === "bus" ? "e.g. HRTC Volvo, Ola Bus" : "Service / vehicle details"
                    }
                    className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
                </div>
              </>
            )}

            {/* Show pre-filled summary when search tab filled the form */}
            {transportSearch !== "manual" && (form.fromStation || form.toStation) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                {form.transportMode === "flight" ? <Plane className="w-4 h-4 text-emerald-600" /> : <TrainFront className="w-4 h-4 text-emerald-600" />}
                <div className="flex-1 min-w-0">
                  {form.title && <p className="text-xs font-semibold text-zinc-800 truncate">{form.title}</p>}
                  <p className="text-[11px] text-emerald-700 truncate">
                    {form.fromStation} → {form.toStation}
                  </p>
                </div>
                <button onClick={() => setTransportSearch("manual")} className="text-zinc-400 hover:text-zinc-600 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}

            <DTPair label="Departure" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Arrival" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Booking ref / PNR</label>
              <input value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="Ticket / PNR / booking ID"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Seat, platform, luggage, tips..." />
          </>}

          {/* ── PLACE / SIGHT ── */}
          {item.type === "place" && <>
            <LocationField label="Place / Sight name" value={form.title} onChange={(v) => set("title", v)}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub }))}
              placeholder="e.g. Taj Mahal, India Gate..." />
            {form.lat && <p className="text-[11px] text-zinc-400 -mt-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
            <DTPair label="Visit date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Opening hours, dress code, tips..." />
          </>}

          {/* ── SHOPPING ── */}
          {item.type === "shopping" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Shop / Market name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Sarojini Nagar, local bazaar..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Location" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Area or address..." />
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="What to buy, budget, bargaining tips..." />
          </>}

          {/* ── NOTE ── */}
          {item.type === "note" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Title (optional)</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Packing list, Reminders..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Note</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Write anything..." rows={4}
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent resize-none placeholder-zinc-300" autoFocus />
            </div>
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
          </>}

          {/* ── OTHER ── */}
          {item.type === "other" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What is this?"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <DTPair label="Start" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="End" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Any details..." />
          </>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-zinc-100 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-full transition-all">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DESTINATION CARD
// ─────────────────────────────────────────────────────────────

function DestinationCard({ item, canEdit, hovered, isDragging, attributes, listeners, dateChip, displayTitle, onDelete, onUpdate, bias }) {
  const [inlineEdit, setInlineEdit] = useState(!item.title);
  const [titleVal, setTitleVal] = useState(item.title || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef(null);
  const { results: destResults, searching: destSearching } = useNominatim(
    inlineEdit && dropdownOpen ? titleVal : "",
    bias
  );

  const commitTitle = () => {
    setInlineEdit(false);
    const trimmed = titleVal.trim();
    if (!trimmed) return;
    if (trimmed !== item.title) onUpdate({ ...item, title: trimmed });
  };

  const selectDest = (r) => {
    setTitleVal(r.primary);
    setInlineEdit(false);
    setDropdownOpen(false);
    onUpdate({ ...item, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub });
  };

  useEffect(() => {
    if (inlineEdit && inputRef.current) inputRef.current.focus();
  }, [inlineEdit]);

  useEffect(() => { setTitleVal(item.title || ""); }, [item.title]);

  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded-xl transition-colors ${hovered && canEdit ? "bg-zinc-50" : ""}`}>
      {canEdit && (
        <div className={`flex items-center gap-0.5 mt-2 flex-shrink-0 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
          <button onClick={onDelete} className="w-5 h-5 flex items-center justify-center text-zinc-300 hover:text-red-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button className="w-5 h-5 flex items-center justify-center text-zinc-300 hover:text-zinc-500 touch-none"
            {...attributes} {...listeners} style={{ cursor: isDragging ? "grabbing" : "grab" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>

          {inlineEdit && canEdit ? (
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                value={titleVal}
                onChange={(e) => { setTitleVal(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(commitTitle, 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { setTitleVal(item.title || ""); setInlineEdit(false); setDropdownOpen(false); }
                }}
                placeholder="Search destination..."
                className="text-2xl font-bold text-zinc-900 outline-none bg-transparent w-full placeholder-zinc-300"
                style={{ caretColor: "#ef4444" }}
                autoComplete="off"
              />
              {dropdownOpen && titleVal.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-30 overflow-hidden max-h-48 overflow-y-auto">
                  {destSearching && (
                    <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
                      <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />
                      Searching...
                    </div>
                  )}
                  {!destSearching && destResults.length === 0 && titleVal.length >= 2 && (
                    <div className="px-4 py-3 text-xs text-zinc-400">No results found</div>
                  )}
                  {destResults.map((r, i) => (
                    <button key={i} onMouseDown={(e) => { e.preventDefault(); selectDest(r); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors text-left">
                      <div className="w-5 h-5 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{r.primary}</p>
                        {r.sub && <p className="text-xs text-zinc-400">{r.sub}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span
              onClick={() => canEdit && setInlineEdit(true)}
              className={`text-2xl font-bold leading-tight ${displayTitle ? "text-zinc-900" : "text-zinc-300 italic font-normal text-lg"} ${canEdit ? "cursor-text" : ""}`}
            >
              {displayTitle || "Destination"}
            </span>
          )}
        </div>

        {(item.region || dateChip) && !inlineEdit && (
          <div className="flex items-center gap-2 mt-0.5 ml-5 flex-wrap">
            {item.region && <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.region}</span>}
            {dateChip && <span className="text-[11px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">{dateChip}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ITEM CARD
// ─────────────────────────────────────────────────────────────

function ItemCard({ item, index, canEdit, tripStartDate, tripEndDate, tripDestination, onUpdate, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item._id || String(index) });

  const meta = TYPE_META[item.type] || TYPE_META.other;
  const isDestination = item.type === "destination";
  const tm = TRANSPORT_MODES.find((m) => m.id === item.transportMode);
  const bias = tripDestination?.coordinates?.lat
    ? { lat: tripDestination.coordinates.lat, lng: tripDestination.coordinates.lng, countryCode: getCountryCode(tripDestination.country) }
    : null;

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const dateChip = (() => {
    const p = [];
    if (item.date) p.push(fmtDateShort(item.date));
    if (item.time) p.push(fmtTime(item.time));
    if (item.endDate && item.endDate !== item.date) p.push("→ " + fmtDateShort(item.endDate));
    if (item.endTime && item.endTime !== item.time) p.push(fmtTime(item.endTime));
    return p.join(" ");
  })();

  const priceChip = item.price ? `${getCurrencySymbol(item.currency || "INR")}${Number(item.price).toLocaleString("en-IN")}` : null;

  const displayTitle = (() => {
    if (item.type === "transport" && item.fromStation && item.toStation)
      return `${item.fromStation} → ${item.toStation}`;
    return item.title || null;
  })();

  // Show route-ready badge for transport items with coords
  const hasTransportRoute = item.type === "transport" && item.fromLat && item.fromLng && item.toLat && item.toLng;

  return (
    <>
      <div ref={setNodeRef} style={style} className={`group/card relative ${isDestination ? "" : "ml-3"}`}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

        {isDestination ? (
          <DestinationCard
            item={item} canEdit={canEdit} hovered={hovered}
            isDragging={isDragging} attributes={attributes} listeners={listeners}
            dateChip={dateChip} displayTitle={displayTitle}
            bias={bias}
            onDelete={() => onDelete(index)}
            onUpdate={(updated) => onUpdate(index, updated, true)}
          />
        ) : (
          <div className={`flex items-start gap-2 px-2 py-2 rounded-xl transition-colors cursor-pointer ${hovered && canEdit ? "bg-zinc-50" : ""}`}
            onClick={() => canEdit && setEditing(true)}>
            {canEdit && (
              <div className={`flex items-center gap-0.5 flex-shrink-0 mt-1 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
                <button onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                  className="w-4 h-4 flex items-center justify-center text-zinc-300 hover:text-red-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <button onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 flex items-center justify-center text-zinc-300 hover:text-zinc-500 touch-none"
                  {...attributes} {...listeners} style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              </div>
            )}

            {(() => {
              const RowIcon = item.type === "transport" && tm ? tm.icon : meta.icon;
              return (
                <span className={`w-6 h-6 flex items-center justify-center rounded-md border flex-shrink-0 mt-1 ${meta.color}`}>
                  <RowIcon className="w-3.5 h-3.5" />
                </span>
              );
            })()}

            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-tight truncate ${displayTitle ? "font-medium text-zinc-800" : "text-zinc-400 italic"}`}>
                {displayTitle || meta.label}
              </p>
              {item.type === "transport" && item.title && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight">{item.title}</p>
              )}
              {item.type !== "transport" && item.region && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.region}</p>
              )}
              {item.rating && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                  <span className="text-[10px] font-semibold text-zinc-600">{item.rating}</span>
                  {item.reviewCount && <span className="text-[10px] text-zinc-400">({item.reviewCount >= 1000 ? (item.reviewCount/1000).toFixed(1)+"k" : item.reviewCount})</span>}
                  {item.isOpen === true && <span className="text-[10px] text-green-600 font-semibold ml-1">● Open</span>}
                  {item.isOpen === false && <span className="text-[10px] text-red-500 font-semibold ml-1">● Closed</span>}
                </div>
              )}
              {item.type === "note" && !item.title && item.notes && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight">{item.notes}</p>
              )}
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {dateChip && <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">{dateChip}</span>}
                {priceChip && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">{priceChip}</span>}
                {item.bookingRef && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">#{item.bookingRef.slice(0, 8)}</span>}
                {hasTransportRoute && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    On map
                  </span>
                )}
              </div>
            </div>

            {item.photo && ["hotel","restaurant","activity","place","shopping"].includes(item.type) && (
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100">
                <img src={item.photo} alt={item.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.parentElement.style.display = "none"; }} />
              </div>
            )}
          </div>
        )}
      </div>

      {editing && item.type !== "destination" && (
        <ItemModal item={item} tripStartDate={tripStartDate} tripEndDate={tripEndDate}
          tripDestination={tripDestination}
          onClose={() => setEditing(false)}
          onSave={(updated) => { onUpdate(index, updated, true); setEditing(false); }} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PLAN TAB — main export
// ─────────────────────────────────────────────────────────────

export default function PlanTab({ trip, canEdit, isMember, itineraryItems, setItineraryItems }) {
  const items = itineraryItems;
  const setItems = setItineraryItems;
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [pendingAdd, setPendingAdd] = useState(null);
  const saveTimeout = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <MapIcon className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Itinerary is private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view the plan.</p>
      </div>
    );
  }

  const saveNow = async (newItems) => {
    setSaving(true);
    try { await api.put(`/trips/${trip._id}/itinerary`, { itinerary: newItems }); }
    catch (e) { console.error("Save failed:", e); }
    finally { setSaving(false); }
  };

  const saveLater = (newItems) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(newItems), 600);
  };

  const updateItem = (index, updated, immediate = false) => {
    const withCid = { ...updated, clientId: updated.clientId || updated._id || makeCid() };
    const newItems = items.map((it, i) => i === index ? withCid : it);
    setItems(newItems);
    if (immediate) saveNow(newItems); else saveLater(newItems);
  };

  const deleteItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    saveNow(newItems);
  };

  const [pendingSearch, setPendingSearch] = useState(null);

  const SEARCH_TYPES = ["hotel", "restaurant", "activity", "place"];
  const handleAddSelect = (type, insertAfterIdx) => {
    if (SEARCH_TYPES.includes(type)) {
      setPendingSearch({ type, insertAfterIdx });
    } else {
      setPendingAdd({ type, insertAfterIdx });
    }
  };

  const handleSearchPick = (placeData) => {
    const { type, insertAfterIdx } = pendingSearch;
    setPendingSearch(null);
    const base = newItem(type);
    const prefilled = { ...base, ...placeData };
    setPendingAdd({ type, insertAfterIdx, prefilled });
  };

  const handleModalSave = (filledItem) => {
    const { insertAfterIdx } = pendingAdd;
    setPendingAdd(null);
    const pos = insertAfterIdx + 1;
    const newItems = [...items.slice(0, pos), filledItem, ...items.slice(pos)];
    setItems(newItems);
    saveNow(newItems);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oi = items.findIndex((it) => it._id === active.id);
    const ni = items.findIndex((it) => it._id === over.id);
    if (oi === -1 || ni === -1) return;
    const reordered = arrayMove(items, oi, ni);
    setItems(reordered);
    saveNow(reordered);
  };

  const activeItem = activeId ? items.find((it) => it._id === activeId) : null;

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/50 flex-shrink-0">
        {saving
          ? <span className="ml-auto text-xs text-zinc-400 flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />Saving...
            </span>
          : <span className="ml-auto text-xs text-emerald-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              Saved
            </span>
        }
      </div>

      {/* Cover photo */}
      <div className="h-40 bg-gradient-to-br from-zinc-200 to-zinc-300 relative overflow-hidden flex-shrink-0">
        {trip.coverPhoto
          ? <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-blue-100 via-zinc-100 to-rose-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
        }
      </div>

      {/* Scrollable itinerary */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((it) => it._id)} strategy={verticalListSortingStrategy}>

            <AddButton canEdit={canEdit} onSelect={(t) => handleAddSelect(t, -1)} />

            {items.map((item, index) => (
              <div key={item._id || index}>
                <ItemCard item={item} index={index} canEdit={canEdit}
                  tripStartDate={trip.startDate} tripEndDate={trip.endDate}
                  tripDestination={trip.destination}
                  onUpdate={updateItem} onDelete={deleteItem} />
                <AddButton canEdit={canEdit} onSelect={(t) => handleAddSelect(t, index)} />
              </div>
            ))}
          </SortableContext>

          <DragOverlay>
            {activeItem && (() => {
              const overlayMeta = TYPE_META[activeItem.type] || TYPE_META.other;
              const OverlayIcon = overlayMeta.icon;
              return (
              <div className="bg-white border border-rose-200 rounded-xl px-3 py-2 shadow-2xl opacity-95 flex items-center gap-2">
                <span className={`w-6 h-6 flex items-center justify-center rounded-md border flex-shrink-0 ${overlayMeta.color}`}>
                  <OverlayIcon className="w-3.5 h-3.5" />
                </span>
                <span className={`${activeItem.type === "destination" ? "text-base font-bold text-zinc-900" : "text-sm font-medium text-zinc-700"}`}>
                  {activeItem.title || (activeItem.type === "transport" && activeItem.fromStation ? `${activeItem.fromStation} → ${activeItem.toStation}` : activeItem.type)}
                </span>
              </div>
              );
            })()}
          </DragOverlay>
        </DndContext>

        {items.length === 0 && canEdit && (
          <div className="text-center py-12 px-4">
            <Plane className="w-10 h-10 text-zinc-300 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium text-zinc-600 mb-1">Start building your itinerary</p>
            <p className="text-xs text-zinc-400">Click the + above to add destinations, hotels, transport, activities and more</p>
          </div>
        )}
      </div>

      {pendingSearch && (
        <PlaceSearchDrawer
          type={pendingSearch.type}
          tripDestination={trip.destination}
          onSelect={handleSearchPick}
          onClose={() => setPendingSearch(null)}
        />
      )}

      {pendingAdd && (
        <ItemModal item={pendingAdd.prefilled || newItem(pendingAdd.type)}
          tripStartDate={trip.startDate} tripEndDate={trip.endDate}
          tripDestination={trip.destination}
          onClose={() => setPendingAdd(null)} onSave={handleModalSave} />
      )}
    </div>
  );
}