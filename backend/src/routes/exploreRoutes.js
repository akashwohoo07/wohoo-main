import express from "express";
import { protect } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../utils/cache.js";

const router = express.Router();

const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

// Turn an upstream Google Places failure into an actionable, user-facing message.
function upstreamMessage(status) {
  if (status === 403)
    return "Places search is unavailable: the Google API key is missing permission. In Google Cloud Console enable 'Places API (New)', enable billing, and ensure the key has no HTTP-referrer restriction (server-side calls need an unrestricted or IP-restricted key).";
  if (status === 429)
    return "Places search hit its rate limit. Please try again in a moment.";
  return "Could not load places right now. Please try again.";
}

// Google Places responses are stable enough to cache; this cuts latency and
// billed API calls dramatically for repeated searches of the same area.
const SEARCH_TTL = 60 * 60;       // 1 hour
const DETAILS_TTL = 6 * 60 * 60;  // 6 hours

// ── CATEGORY → GOOGLE PLACE TYPES ────────────────────────────
const CATEGORY_TYPES = {
  stays: [
    "hotel", "motel", "lodging", "hostel",
    "extended_stay_hotel", "resort_hotel", "bed_and_breakfast",
  ],
  activities: [
    "tourist_attraction", "amusement_park", "aquarium",
    "art_gallery", "bowling_alley", "casino", "movie_theater",
    "museum", "night_club", "park", "spa", "stadium",
    "zoo", "hiking_area", "historical_landmark",
  ],
  eats: [
    "restaurant", "cafe", "bar", "bakery", "fast_food_restaurant",
    "food_court", "pizza_restaurant", "indian_restaurant",
    "chinese_restaurant", "meal_takeaway", "meal_delivery",
  ],
  sights: [
    "tourist_attraction", "museum", "historical_landmark",
    "art_gallery", "hindu_temple", "church", "mosque",
    "place_of_worship", "natural_feature", "park",
  ],
};

// Fields to request (controls billing — only pay for what you use)
const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours",
  "places.primaryType",
  "places.types",
  "places.photos",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.editorialSummary",
].join(",");

const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "currentOpeningHours",
  "regularOpeningHours",
  "primaryType",
  "types",
  "photos",
  "businessStatus",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
  "reviews",
  "goodForChildren",
  "goodForGroups",
  "allowsDogs",
  "restroom",
  "parkingOptions",
  "accessibilityOptions",
].join(",");

// ── NORMALIZE GOOGLE PLACE → APP FORMAT ──────────────────────
function normalizePlace(p, refLat, refLng) {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;

  let distKm = null;
  if (lat && lng && refLat && refLng) {
    const R = 6371;
    const dLat = (lat - refLat) * Math.PI / 180;
    const dLon = (lng - refLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
      Math.cos(refLat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLon/2)**2;
    distKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
  }

  // Categories from types
  const rawTypes = p.types || (p.primaryType ? [p.primaryType] : []);
  const categories = rawTypes
    .map(t => t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()))
    .filter(t => !["Point Of Interest", "Establishment"].includes(t))
    .slice(0, 3);

  // Photo URLs — Google Places API (New) photo format
  // Photos come as {name: "places/xxx/photos/yyy"} — we build the URL
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  const photos = (p.photos || []).slice(0, 5).map(ph =>
    `${GOOGLE_PLACES_BASE}/${ph.name}/media?maxHeightPx=600&maxWidthPx=900&key=${apiKey}`
  );

  // Opening hours
  const hours = p.currentOpeningHours?.weekdayDescriptions?.join("\n") ||
    p.regularOpeningHours?.weekdayDescriptions?.join("\n") || null;
  const isOpen = p.currentOpeningHours?.openNow ?? null;

  // Price level: PRICE_LEVEL_INEXPENSIVE=1, MODERATE=2, EXPENSIVE=3, VERY_EXPENSIVE=4
  const priceMap = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const price = priceMap[p.priceLevel] ?? null;

  // Reviews (only in details response)
  const reviews = (p.reviews || []).slice(0, 3).map(r => ({
    author: r.authorAttribution?.displayName || "Anonymous",
    authorPhoto: r.authorAttribution?.photoUri || null,
    rating: r.rating,
    text: r.text?.text || "",
    time: r.relativePublishTimeDescription || "",
  }));

  // Amenities from fields
  const amenities = [];
  if (p.restroom) amenities.push({ icon: "🚻", label: "Restroom" });
  if (p.goodForChildren) amenities.push({ icon: "👶", label: "Kid Friendly" });
  if (p.goodForGroups) amenities.push({ icon: "👥", label: "Groups" });
  if (p.allowsDogs) amenities.push({ icon: "🐾", label: "Pet Friendly" });
  if (p.parkingOptions?.paidParkingLot || p.parkingOptions?.freeParkingLot) {
    amenities.push({ icon: "🅿️", label: "Parking" });
  }
  if (p.accessibilityOptions?.wheelchairAccessibleEntrance) {
    amenities.push({ icon: "♿", label: "Accessible" });
  }

  return {
    id: p.id,
    name: p.displayName?.text || p.displayName || "Unknown",
    categories,
    lat,
    lng,
    address: p.formattedAddress || null,
    rating: p.rating ? parseFloat(p.rating.toFixed(1)) : null,
    reviewCount: p.userRatingCount || null,
    photos,
    photo: photos[0] || null,
    hours,
    isOpen,
    website: p.websiteUri || null,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    price,
    description: p.editorialSummary?.text || null,
    reviews,
    amenities,
    distKm,
    businessStatus: p.businessStatus || null,
  };
}

// ── NEARBY SEARCH ─────────────────────────────────────────────
// GET /api/explore/search?ll=lat,lng&kind=stays|activities|eats|sights&radius=&query=
router.get("/search", protect, async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) {
      // 200 + success:false so the SPA shows a message instead of a console error
      return res.json({
        success: false,
        results: [],
        message: "Places search is not configured. Add GOOGLE_PLACES_KEY to backend .env",
      });
    }

    const { ll, kind = "stays", radius = 3000, query } = req.query;
    if (!ll) return res.status(400).json({ success: false, message: "ll required" });

    const [lat, lng] = ll.split(",").map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: "Invalid coordinates" });
    }

    const includedTypes = CATEGORY_TYPES[kind] || CATEGORY_TYPES.sights;
    const radiusM = Math.min(parseInt(radius) || 3000, 50000);

    // Round coordinates so nearby requests share a cache entry
    const cacheKey = `explore:search:${kind}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusM}:${query || ""}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, results: cached, cached: true });

    const body = {
      includedTypes,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
      maxResultCount: 20,
      rankPreference: query ? "RELEVANCE" : "POPULARITY",
    };

    if (query) body.textQuery = query;

    const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELDS,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Google Places Search Error]", response.status, err);
      // 200 + success:false: the SPA renders the message cleanly (no console 502 spam).
      return res.json({
        success: false,
        results: [],
        message: upstreamMessage(response.status),
      });
    }

    const data = await response.json();
    const results = (data.places || [])
      .map(p => normalizePlace(p, lat, lng))
      .filter(p => p.name && p.lat && p.lng);

    await cacheSet(cacheKey, results, SEARCH_TTL);
    res.json({ success: true, results });
  } catch (err) {
    console.error("[Explore Search Error]", err.message);
    res.json({
      success: false,
      results: [],
      message: "Could not load places right now. Please try again.",
    });
  }
});

// ── PLACE DETAILS ─────────────────────────────────────────────
// GET /api/explore/details/:placeId
router.get("/details/:placeId", protect, async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) return res.json({ success: false, message: "Places details not configured." });

    const { placeId } = req.params;
    const { refLat, refLng } = req.query;

    const cacheKey = `explore:details:${placeId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, place: cached, cached: true });

    const response = await fetch(`${GOOGLE_PLACES_BASE}/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELDS,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Google Places Details Error]", response.status, err);
      // 200 + success:false — the detail view keeps its list data and doesn't error
      return res.json({ success: false, message: upstreamMessage(response.status) });
    }

    const p = await response.json();
    const place = normalizePlace(p, parseFloat(refLat) || null, parseFloat(refLng) || null);
    await cacheSet(cacheKey, place, DETAILS_TTL);
    res.json({ success: true, place });
  } catch (err) {
    console.error("[Explore Details Error]", err.message);
    res.json({ success: false, message: "Could not load place details right now." });
  }
});

export default router;