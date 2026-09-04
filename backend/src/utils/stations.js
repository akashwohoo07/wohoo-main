import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Bundled Indian Railways stations (code + name + coords, from the open
// datameet/railways dataset) — loaded once into memory. Free, offline, instant;
// no external API, no rate limits (Nominatim blocks cloud IPs). Coordinates let
// a manually-added train draw its track between the two stations.
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIONS = JSON.parse(readFileSync(join(__dirname, "../data/stations.json"), "utf8"));

// Rank: exact code > code prefix > name starts-with > name contains.
export function searchStations(q, limit = 8) {
  const query = (q || "").trim().toLowerCase();
  if (query.length < 2) return [];
  const codeExact = [], codePrefix = [], nameStarts = [], contains = [];
  for (const s of STATIONS) {
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    if (code === query) codeExact.push(s);
    else if (code.startsWith(query)) codePrefix.push(s);
    else if (name.startsWith(query)) nameStarts.push(s);
    else if (name.includes(query)) contains.push(s);
    if (codeExact.length >= limit) break;
  }
  return [...codeExact, ...codePrefix, ...nameStarts, ...contains]
    .slice(0, limit)
    .map((s) => ({
      code: s.code,
      name: s.name,
      state: s.state,
      city: s.state, // dataset has no separate city; state is the useful context
      country: "India",
      lat: s.lat,
      lng: s.lng,
      label: `${s.name}${s.code ? " (" + s.code + ")" : ""}`,
    }));
}
