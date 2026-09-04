import { useState } from "react";
import { Plane, TrainFront, Clock } from "lucide-react";
import api from "../../api/axios";
import StationInput from "../../components/StationInput";

// ── Backend proxy helpers ──────────────────────────────────────
// All external API calls go through /api/transport/* to avoid CORS

async function apiFlight(flightNum, date) {
  try {
    const res = await api.get("/transport/flight", { params: { flightNum, date } });
    return { ok: true, data: res.data.flight };
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || "Request failed";
    const code = err.response?.data?.error || "unknown";
    return { ok: false, code, message: msg };
  }
}

async function apiGeocodeTransport(q, type) {
  try {
    const res = await api.get("/transport/geocode", { params: { q, type } });
    return res.data.result || null;
  } catch {
    return null;
  }
}

async function apiTrain(query, searchType) {
  try {
    const endpoint = searchType === "pnr" ? "/transport/pnr" : "/transport/train";
    const params = searchType === "pnr" ? { pnr: query } : { query, searchType };
    const res = await api.get(endpoint, { params });
    return { ok: true, data: searchType === "pnr" ? res.data.pnr : res.data.train };
  } catch (err) {
    const msg = err.response?.data?.message || "Request failed";
    const code = err.response?.data?.error || "unknown";
    return { ok: false, code, message: msg };
  }
}

// ── FlightSearchPanel ──────────────────────────────────────────
export function FlightSearchPanel({ onFill, initialFlightNum = "", initialDate = "" }) {
  const [flightNum, setFlightNum] = useState(initialFlightNum);
  const [date, setDate] = useState(initialDate || new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);

  const handleSearch = async () => {
    if (!flightNum.trim() || !date) return;
    setLoading(true);
    setError("");
    setResult(null);

    const res = await apiFlight(flightNum.trim(), date);
    setLoading(false);

    if (!res.ok) {
      const messages = {
        no_key:        "Flight lookup not configured on server. Add AVIATIONSTACK_KEY to server .env",
        not_found:     `No flight found for "${flightNum}" on ${date}. Check the number and date.`,
        api_error:     "AviationStack API error. Try again shortly.",
        network_error: "Could not reach the flight API. Check server connection.",
      };
      setError(messages[res.code] || res.message || "Unknown error");
      return;
    }
    setResult(res.data);
  };

  const handleUse = async () => {
    if (!result) return;
    setResolving(true);

    // Geocode both airports via backend proxy (Nominatim server-side)
    const [dep, arr] = await Promise.all([
      apiGeocodeTransport(result.depIATA || result.depAirport, "airport"),
      apiGeocodeTransport(result.arrIATA || result.arrAirport, "airport"),
    ]);
    setResolving(false);

    // Parse times — AviationStack returns ISO datetime strings
    const parseTime = (iso) => {
      if (!iso) return { date: "", time: "" };
      const d = new Date(iso);
      return {
        date: d.toISOString().split("T")[0],
        time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      };
    };

    const dep_dt = parseTime(result.depTime);
    const arr_dt = parseTime(result.arrTime);

    onFill({
      title: `${result.flightNum}${result.airline ? " · " + result.airline : ""}`,
      fromStation: dep?.label || result.depAirport || result.depIATA || "",
      toStation:   arr?.label || result.arrAirport || result.arrIATA || "",
      fromLat: dep?.lat ?? null,
      fromLng: dep?.lng ?? null,
      toLat:   arr?.lat ?? null,
      toLng:   arr?.lng ?? null,
      date:    dep_dt.date || date,
      time:    dep_dt.time,
      endDate: arr_dt.date || date,
      endTime: arr_dt.time,
      notes: [
        result.airline  ? `Flight: ${result.airline} — ${result.flightNum}` : "",
        result.status   ? `Status: ${result.status}` : "",
        result.aircraft ? `Aircraft: ${result.aircraft}` : "",
        result.depTerminal ? `Dept. Terminal ${result.depTerminal}${result.depGate ? ", Gate " + result.depGate : ""}` : "",
        result.arrTerminal ? `Arr. Terminal ${result.arrTerminal}` : "",
      ].filter(Boolean).join("\n"),
    });
  };

  const fmtLocalTime = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
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
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. 6E984, AI101"
            className="w-full text-sm border border-sky-200 focus:border-sky-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1 block">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs border border-sky-200 focus:border-sky-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700" />
        </div>
      </div>

      <button onClick={handleSearch} disabled={loading || !flightNum.trim() || !date}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-xl transition-all flex items-center justify-center gap-2">
        {loading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {loading ? "Searching..." : "Look up flight"}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <p className="text-xs text-red-600 leading-relaxed">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-sky-200 rounded-xl p-3 space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-800">{result.flightNum}</p>
              {result.airline && <p className="text-[11px] text-zinc-400">{result.airline}</p>}
            </div>
            {result.status && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                result.status === "active"    ? "bg-green-100 text-green-700" :
                result.status === "scheduled" ? "bg-blue-100 text-blue-700"  :
                result.status === "landed"    ? "bg-zinc-100 text-zinc-600"  :
                result.status === "cancelled" ? "bg-red-100 text-red-600"    :
                "bg-amber-100 text-amber-700"
              }`}>
                {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
              </span>
            )}
          </div>

          {/* From → To */}
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-zinc-900">{result.depIATA || "—"}</p>
              <p className="text-[10px] text-zinc-400 truncate leading-tight max-w-[80px] mx-auto">{result.depAirport}</p>
              {result.depTime && <p className="text-[11px] font-semibold text-zinc-700 mt-0.5">{fmtLocalTime(result.depTime)}</p>}
              {result.depTerminal && <p className="text-[10px] text-zinc-400">T{result.depTerminal}{result.depGate ? " · G" + result.depGate : ""}</p>}
            </div>
            <div className="flex-shrink-0 text-center px-1">
              <div className="flex items-center gap-0.5">
                <div className="w-4 h-px bg-zinc-300" />
                <Plane className="w-3 h-3 text-zinc-400" />
                <div className="w-4 h-px bg-zinc-300" />
              </div>
              {result.aircraft && <p className="text-[9px] text-zinc-300 mt-0.5">{result.aircraft}</p>}
            </div>
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-zinc-900">{result.arrIATA || "—"}</p>
              <p className="text-[10px] text-zinc-400 truncate leading-tight max-w-[80px] mx-auto">{result.arrAirport}</p>
              {result.arrTime && <p className="text-[11px] font-semibold text-zinc-700 mt-0.5">{fmtLocalTime(result.arrTime)}</p>}
              {result.arrTerminal && <p className="text-[10px] text-zinc-400">T{result.arrTerminal}</p>}
            </div>
          </div>

          <button onClick={handleUse} disabled={resolving}
            className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center gap-2">
            {resolving && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {resolving ? "Resolving airport locations…" : "Use this flight →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── TrainSearchPanel ───────────────────────────────────────────
export function TrainSearchPanel({ onFill, initialQuery = "", initialDate = "" }) {
  const [searchType, setSearchType] = useState("number"); // number | pnr | name | manual
  const [query, setQuery] = useState(initialQuery);
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);

  // Manual entry: two stations (with coords, so the track draws) + optional details.
  const [mFrom, setMFrom] = useState(null); // { name, label, lat, lng }
  const [mTo, setMTo] = useState(null);
  const [mName, setMName] = useState("");
  const [mDate, setMDate] = useState(initialDate);
  const [mTime, setMTime] = useState("");

  const TYPES = [
    { id: "number", label: "Train No.",  placeholder: "e.g. 12001, 22691" },
    { id: "pnr",    label: "PNR",        placeholder: "10-digit PNR number" },
    { id: "name",   label: "Train Name", placeholder: "e.g. Shatabdi, Rajdhani" },
    { id: "manual", label: "Manual",     placeholder: "" },
  ];

  const addManual = () => {
    if (!mFrom || !mTo) return;
    onFill({
      title: (mName.trim() || `${mFrom.name} → ${mTo.name}`).slice(0, 200),
      fromStation: mFrom.label || mFrom.name,
      toStation: mTo.label || mTo.name,
      fromLat: mFrom.lat ?? null,
      fromLng: mFrom.lng ?? null,
      toLat: mTo.lat ?? null,
      toLng: mTo.lng ?? null,
      date: mDate || "",
      time: mTime || "",
      notes: mName.trim() ? `Train: ${mName.trim()}` : "",
    });
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    const res = await apiTrain(query.trim(), searchType);
    setLoading(false);

    if (!res.ok) {
      const messages = {
        no_key:    "RAPIDAPI_KEY not set on server. Add it to server .env for live train data.",
        not_found: `Train not found for "${query}". Try a different search.`,
        api_error: "Train API error. Please try again.",
      };
      setError(messages[res.code] || res.message || "Unknown error");
      return;
    }
    setResult(res.data);
  };

  const handleUse = async () => {
    if (!result) return;
    setResolving(true);

    const from = result.from || result.boarding_point || "";
    const to   = result.to   || result.destination   || "";

    const [fromGeo, toGeo] = await Promise.all([
      from ? apiGeocodeTransport(from, "station") : Promise.resolve(null),
      to   ? apiGeocodeTransport(to,   "station") : Promise.resolve(null),
    ]);
    setResolving(false);

    // For PNR we take the journey date + time straight from the ticket — the user
    // never has to type them. Platform shows only if the provider returned one.
    onFill({
      title: result.trainNum
        ? `${result.trainName || ""}${result.trainNum ? " (" + result.trainNum + ")" : ""}`.trim()
        : result.trainName || query,
      fromStation: fromGeo?.label || from || "",
      toStation:   toGeo?.label   || to   || "",
      fromLat: fromGeo?.lat ?? null,
      fromLng: fromGeo?.lng ?? null,
      toLat:   toGeo?.lat   ?? null,
      toLng:   toGeo?.lng   ?? null,
      date: result.date || date || "",
      time: result.departureTime || "",
      endTime: result.arrivalTime || "",
      bookingRef: searchType === "pnr" ? query : "",
      notes: [
        result.trainNum  ? `Train: ${result.trainName} — ${result.trainNum}` : "",
        result.classType ? `Class: ${result.classType}` : "",
        result.status    ? `Status: ${result.status}`   : "",
        result.duration  ? `Duration: ${result.duration}` : "",
        result.departure ? `Departure: ${result.departure}` : "",
        result.arrival   ? `Arrival: ${result.arrival}`     : "",
        result.platform  ? `Platform: ${result.platform}`   : "",
        searchType === "pnr" ? `PNR: ${query}` : "",
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
        {TYPES.map((t) => (
          <button key={t.id} onClick={() => { setSearchType(t.id); setQuery(""); setResult(null); setError(""); }}
            className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${searchType === t.id ? "bg-white text-amber-800 shadow-sm" : "text-amber-600 hover:text-amber-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {searchType === "manual" ? (
        /* ── Manual entry: pick two stations (coords → track on the map) ── */
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">From station</label>
            <StationInput
              value={mFrom?.label || ""}
              onChange={() => setMFrom(null)}
              onSelect={setMFrom}
              placeholder="Search departure station…"
              className="w-full text-sm border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">To station</label>
            <StationInput
              value={mTo?.label || ""}
              onChange={() => setMTo(null)}
              onSelect={setMTo}
              placeholder="Search arrival station…"
              className="w-full text-sm border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300"
            />
          </div>
          <input value={mName} onChange={(e) => setMName(e.target.value)} maxLength={200}
            placeholder="Train name / number (optional)"
            className="w-full text-sm border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">Date (optional)</label>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                className="w-full text-xs border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">Time (optional)</label>
              <input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)}
                className="w-full text-xs border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700" />
            </div>
          </div>
          <button onClick={addManual} disabled={!mFrom || !mTo}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-xl transition-all">
            Add train →
          </button>
          {(!mFrom || !mTo) && <p className="text-[11px] text-amber-600/80">Pick both stations to draw the track between them.</p>}
        </div>
      ) : (
      <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder={TYPES.find(t => t.id === searchType)?.placeholder}
        className="w-full text-sm border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700 placeholder-zinc-300" />

      {searchType !== "pnr" && (
        <div>
          <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">Travel Date (optional)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs border border-amber-200 focus:border-amber-400 outline-none px-2.5 py-1.5 rounded-lg bg-white text-zinc-700" />
        </div>
      )}
      {searchType === "pnr" && (
        <p className="text-[11px] text-amber-600/90">Date, time & stations are pulled from the PNR — no need to enter them.</p>
      )}

      <button onClick={handleSearch} disabled={loading || !query.trim()}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-xl transition-all flex items-center justify-center gap-2">
        {loading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {loading ? "Searching..." : "Look up"}
      </button>
      </>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <p className="text-xs text-red-600 leading-relaxed">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
          <div>
            <p className="text-sm font-bold text-zinc-800">
              {result.trainName || result.trainNum || "—"}
            </p>
            {result.trainNum && result.trainName && (
              <p className="text-[11px] text-zinc-400">Train #{result.trainNum}</p>
            )}
          </div>

          {(result.from || result.to) && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">From</p>
                <p className="text-xs font-semibold text-zinc-800">{result.from || "—"}</p>
                {result.departure && <p className="text-[10px] text-zinc-400">{result.departure}</p>}
              </div>
              <span className="text-zinc-400 text-xs flex-shrink-0">→</span>
              <div className="flex-1 text-right">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">To</p>
                <p className="text-xs font-semibold text-zinc-800">{result.to || "—"}</p>
                {result.arrival && <p className="text-[10px] text-zinc-400">{result.arrival}</p>}
              </div>
            </div>
          )}

          {result.status && (
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {result.status}
            </span>
          )}
          {result.duration && (
            <p className="text-[11px] text-zinc-400 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {result.duration}</p>
          )}

          <button onClick={handleUse} disabled={resolving}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-xl transition-all flex items-center justify-center gap-2">
            {resolving && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {resolving ? "Resolving stations…" : "Use this train →"}
          </button>
        </div>
      )}
    </div>
  );
}