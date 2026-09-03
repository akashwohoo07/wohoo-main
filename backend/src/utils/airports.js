import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Bundled OpenFlights airports (IATA + coords) — loaded once into memory. Free,
// offline, instant; no external API/billing. Only airports with a valid IATA code.
const __dirname = dirname(fileURLToPath(import.meta.url));
const AIRPORTS = JSON.parse(readFileSync(join(__dirname, "../data/airports.json"), "utf8"));

// Rank: exact IATA > IATA prefix > city-starts-with > city/name contains.
export function searchAirports(q, limit = 8) {
  const query = (q || "").trim().toLowerCase();
  if (query.length < 2) return [];
  const iataExact = [], iataPrefix = [], cityStarts = [], contains = [];
  for (const a of AIRPORTS) {
    const iata = a.iata.toLowerCase();
    const city = (a.city || "").toLowerCase();
    const name = (a.name || "").toLowerCase();
    if (iata === query) iataExact.push(a);
    else if (iata.startsWith(query)) iataPrefix.push(a);
    else if (city.startsWith(query)) cityStarts.push(a);
    else if (city.includes(query) || name.includes(query)) contains.push(a);
  }
  return [...iataExact, ...iataPrefix, ...cityStarts, ...contains].slice(0, limit);
}
