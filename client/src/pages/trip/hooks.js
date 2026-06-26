import { useState, useEffect } from "react";

// ── useDebounce ────────────────────────────────────────────────
export function useDebounce(value, delay) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ── useNominatim — location autocomplete ──────────────────────
export function useNominatim(query, bias = null) {
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
          mapped.sort((a, b) => (a.countryCode === bias.countryCode.toUpperCase() ? 0 : 1) - (b.countryCode === bias.countryCode.toUpperCase() ? 0 : 1));
        }
        setResults(mapped);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [dq, bias?.lat, bias?.lng, bias?.countryCode]);

  return { results, searching };
}

// ── useHotelSearch — OSM + Nominatim hotel search ─────────────
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

export function useHotelSearch(query, bias = null) {
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
            method: "POST", body: `data=${encodeURIComponent(q)}`,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
          const data = await res.json();
          hotels = (data.elements || []).filter((el) => el.tags?.name).map((el) => {
            const tags = el.tags || {};
            const addr = [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ");
            return { name: tags.name, region: addr || "", lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon, placeId: String(el.id), type: tags.tourism || "hotel", stars: tags.stars ? Number(tags.stars) : null, amenities: parseOsmAmenities(tags), photo: null };
          });
          if (!hotels.length) throw new Error("overpass_empty");
        } else { throw new Error("no_bias"); }
        if (cancelled) return;
        setResults(hotels);
        hotels.forEach(async (h, i) => {
          const photo = await fetchHotelPhoto(h.region ? `${h.name} ${h.region}` : h.name);
          if (!cancelled) setResults((prev) => prev.map((r, j) => j === i ? { ...r, photo } : r));
        });
      } catch {
        if (cancelled) return;
        try {
          let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dq)}&format=json&limit=10&addressdetails=1`;
          if (bias?.lat && bias?.lng) { const d = 4; url += `&viewbox=${bias.lng-d},${bias.lat+d},${bias.lng+d},${bias.lat-d}&bounded=0`; }
          if (bias?.countryCode) url += `&countrycodes=${bias.countryCode}`;
          const res = await fetch(url, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          const KW = ["hotel","inn","resort","hostel","lodge","suites","palace","manor","villa","motel","homestay"];
          const hotels = data
            .filter((p) => { const cls = p.class || ""; const type = p.type || ""; const dn = p.display_name?.toLowerCase() || ""; return cls === "tourism" || ["hotel","hostel","motel","guest_house","resort"].includes(type) || KW.some((kw) => dn.includes(kw)); })
            .map((p) => { const a = p.address || {}; const city = a.city || a.town || a.village || a.county || ""; const country = a.country || ""; return { name: p.name || p.display_name.split(",")[0].trim(), region: [city, country].filter(Boolean).join(", "), lat: parseFloat(p.lat), lng: parseFloat(p.lon), placeId: p.place_id?.toString(), type: p.type || "hotel", stars: null, amenities: [], photo: null }; })
            .filter((h) => h.name).slice(0, 8);
          if (cancelled) return;
          setResults(hotels);
          hotels.forEach(async (h, i) => {
            const photo = await fetchHotelPhoto(h.name);
            if (!cancelled) setResults((prev) => prev.map((r, j) => j === i ? { ...r, photo } : r));
          });
        } catch { if (!cancelled) setResults([]); }
      } finally { if (!cancelled) setSearching(false); }
    };

    run();
    return () => { cancelled = true; };
  }, [dq, bias?.lat, bias?.lng, bias?.countryCode]);

  return { results, searching };
}