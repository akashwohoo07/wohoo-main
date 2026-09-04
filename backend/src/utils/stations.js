import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Bundled Indian Railways stations (code + name + coords + address text, from the
// open datameet/railways dataset) — loaded once into memory. Free, offline,
// instant; no external API, no rate limits, and no third-party ToS restrictions
// on retaining/searching the data (unlike Mapbox/Google geocoding, which forbid
// storing results and — for Mapbox — carry no Indian stations at all).
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIONS = JSON.parse(readFileSync(join(__dirname, "../data/stations.json"), "utf8"));

// A precomputed lowercase search blob (name + code + address) per station, so a
// query can match the station name, its code, OR the city/area in its address.
for (const s of STATIONS) {
  s._s = `${s.name} ${s.code} ${s.addr || ""} ${s.state || ""}`.toLowerCase();
}
const BY_CODE = new Map(STATIONS.map((s) => [s.code, s]));

// Curated "city → its main stations" map. Many big-city stations aren't named
// after the city (e.g. Pune's "Shivajinagar", Delhi's "Hazrat Nizamuddin"), so
// typing the city wouldn't surface them from name-matching alone. This fills that
// gap for the busiest cities. Codes are verified to exist in the dataset.
const CITY_ALIASES = {
  delhi: ["NDLS", "DLI", "NZM", "ANVT", "DEE"],
  "new delhi": ["NDLS", "DLI", "NZM", "ANVT"],
  mumbai: ["CSTM", "BCT", "LTT", "DR", "BDTS"],
  bombay: ["CSTM", "BCT", "LTT", "BDTS"],
  bengaluru: ["SBC", "YPR", "BNC", "KJM"],
  bangalore: ["SBC", "YPR", "BNC", "KJM"],
  chennai: ["MAS", "MS", "MSB"],
  madras: ["MAS", "MS", "MSB"],
  kolkata: ["HWH", "SDAH", "KOAA"],
  calcutta: ["HWH", "SDAH", "KOAA"],
  hyderabad: ["SC", "HYB", "KCG"],
  secunderabad: ["SC", "HYB"],
  pune: ["PUNE", "SVJR"],
  ahmedabad: ["ADI"],
  jaipur: ["JP"],
  lucknow: ["LKO", "LJN"],
  kanpur: ["CNB"],
  nagpur: ["NGP"],
  patna: ["PNBE", "RJPB"],
  bhopal: ["BPL", "HBJ"],
  surat: ["ST"],
  vadodara: ["BRC"],
  baroda: ["BRC"],
  indore: ["INDB"],
  coimbatore: ["CBE"],
  ernakulam: ["ERS", "ERN"],
  kochi: ["ERS", "ERN"],
  cochin: ["ERS", "ERN"],
  thiruvananthapuram: ["TVC"],
  trivandrum: ["TVC"],
  guwahati: ["GHY"],
  visakhapatnam: ["VSKP"],
  vizag: ["VSKP"],
  varanasi: ["BSB"],
  banaras: ["BSB"],
  prayagraj: ["ALD"],
  allahabad: ["ALD"],
  amritsar: ["ASR"],
  chandigarh: ["CDG"],
  gurgaon: ["GGN"],
  gurugram: ["GGN"],
  ranchi: ["RNC"],
  jodhpur: ["JU"],
  udaipur: ["UDZ"],
  dehradun: ["DDN"],
  gwalior: ["GWL"],
  jabalpur: ["JBP"],
  madurai: ["MDU"],
  trichy: ["TPJ"],
  tiruchirappalli: ["TPJ"],
  mysuru: ["MYS"],
  mysore: ["MYS"],
  mangaluru: ["MAQ"],
  mangalore: ["MAQ"],
  vijayawada: ["BZA"],
  nashik: ["NK"],
};

const toResult = (s) => ({
  code: s.code,
  name: s.name,
  state: s.state,
  city: s.addr || s.state,
  country: "India",
  lat: s.lat,
  lng: s.lng,
  label: `${s.name}${s.code ? " (" + s.code + ")" : ""}`,
});

// Search by station name, code, OR city/area. Ranking:
//   code exact > city alias > code prefix > name starts > name/address contains.
// Deduped by code so a station never repeats across buckets.
export function searchStations(q, limit = 8) {
  const query = (q || "").trim().toLowerCase();
  if (query.length < 2) return [];

  const picked = new Map(); // code -> station, preserves first (best-ranked) hit
  const add = (s) => { if (s && !picked.has(s.code)) picked.set(s.code, s); };

  // 1) Exact station code (e.g. "NDLS").
  if (BY_CODE.has(query.toUpperCase())) add(BY_CODE.get(query.toUpperCase()));

  // 2) City alias → its main stations (e.g. "pune" → Pune Jn + Shivajinagar).
  if (CITY_ALIASES[query]) CITY_ALIASES[query].forEach((code) => add(BY_CODE.get(code)));

  // 3) Name/code/address matches, ranked by where the query hits.
  const codePrefix = [], nameStarts = [], contains = [];
  for (const s of STATIONS) {
    if (picked.has(s.code)) continue;
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    if (code.startsWith(query)) codePrefix.push(s);
    else if (name.startsWith(query)) nameStarts.push(s);
    else if (s._s.includes(query)) contains.push(s);
    if (picked.size + codePrefix.length >= limit && nameStarts.length && contains.length) {
      // enough candidates gathered; stop scanning early
      if (codePrefix.length + nameStarts.length + contains.length > limit * 3) break;
    }
  }
  [...codePrefix, ...nameStarts, ...contains].forEach(add);

  return [...picked.values()].slice(0, limit).map(toResult);
}
