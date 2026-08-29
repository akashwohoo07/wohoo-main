import { useState, useEffect, useRef, useCallback } from "react";
import api from "../../api/axios";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const CATEGORIES = {
  stays:      { kind: "stays",      label: "Stays",      icon: "🛏️", color: "#3b82f6", itemType: "hotel"      },
  activities: { kind: "activities", label: "Activities", icon: "🎯", color: "#8b5cf6", itemType: "activity"   },
  eats:       { kind: "eats",       label: "Eats",       icon: "🍽️", color: "#f59e0b", itemType: "restaurant" },
  sights:     { kind: "sights",     label: "Sights",     icon: "📸", color: "#10b981", itemType: "place"      },
};

const SORT_OPTIONS = [
  { value: "distance", label: "Distance"       },
  { value: "rating",   label: "Highest Rating" },
  { value: "reviews",  label: "Most Reviewed"  },
];

const PRICE_LABELS = ["", "₹", "₹₹", "₹₹₹", "₹₹₹₹"];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDist(km) {
  if (km === null || km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km}km`;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name) {
  return name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

async function geocodeCity(name) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  if (!data?.[0]) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ─────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────

function StarRating({ rating, count, size = "sm" }) {
  if (!rating) return null;
  const r = parseFloat(rating);
  const sz = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} className={`${sz} ${i < Math.round(r) ? "text-amber-400" : "text-zinc-200"}`}
            fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        ))}
      </div>
      <span className={`font-bold text-zinc-700 ${size === "sm" ? "text-xs" : "text-sm"}`}>{r.toFixed(1)}</span>
      {count != null && (
        <span className={`text-zinc-400 ${size === "sm" ? "text-[10px]" : "text-xs"}`}>
          ({count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count})
        </span>
      )}
    </div>
  );
}

function RatingBadge({ rating }) {
  if (!rating) return null;
  const r = parseFloat(rating);
  const bg = r >= 4.5 ? "bg-green-500" : r >= 4 ? "bg-lime-500" : r >= 3.5 ? "bg-yellow-500" : "bg-orange-400";
  return (
    <span className={`${bg} text-white text-xs font-bold px-2 py-0.5 rounded-lg`}>
      {r.toFixed(1)}
    </span>
  );
}

function OpenBadge({ isOpen }) {
  if (isOpen === null || isOpen === undefined) return null;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      isOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
    }`}>
      {isOpen ? "● Open" : "● Closed"}
    </span>
  );
}

function PhotoCarousel({ photos, name }) {
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState({});

  const validPhotos = photos?.filter((_, i) => !errors[i]) || [];

  if (!validPhotos.length) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
        <span className="text-5xl opacity-10">📍</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group select-none">
      <img
        src={validPhotos[Math.min(idx, validPhotos.length - 1)]}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setErrors(prev => ({ ...prev, [idx]: true }))}
      />
      {validPhotos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-base leading-none"
          >‹</button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => Math.min(validPhotos.length - 1, i + 1)); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-base leading-none"
          >›</button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {validPhotos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLACE CARD (grid list item)
// ─────────────────────────────────────────────────────────────

function PlaceCard({ place, onSelect, onAdd, isAdded, isHovered, onHover }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`relative bg-white rounded-2xl overflow-hidden border transition-all cursor-pointer group ${
        isHovered
          ? "border-rose-300 shadow-lg scale-[1.01]"
          : "border-zinc-100 hover:border-zinc-200 hover:shadow-md"
      }`}
      onClick={() => onSelect(place)}
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Added badge */}
      {isAdded && (
        <div className="absolute top-2 left-2 z-10 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
          </svg>
          Added
        </div>
      )}

      {/* Photo */}
      <div className="h-40 overflow-hidden relative bg-zinc-100">
        {place.photo && !imgError ? (
          <img
            src={place.photo}
            alt={place.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
            <span className="text-4xl opacity-20">📍</span>
          </div>
        )}

        {/* Quick add button */}
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(place); }}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all z-10 ${
            isAdded
              ? "bg-rose-500 text-white"
              : "bg-white/90 text-zinc-600 hover:bg-white hover:text-rose-500"
          }`}
          title={isAdded ? "Added to trip" : "Add to trip"}
        >
          {isAdded
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
          }
        </button>

        {/* Distance */}
        {place.distKm !== null && (
          <div className="absolute bottom-2 left-2 bg-black/55 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
            {fmtDist(place.distKm)}
          </div>
        )}

        {/* Open/Closed */}
        {place.isOpen !== null && (
          <div className="absolute bottom-2 right-2">
            <OpenBadge isOpen={place.isOpen} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {/* Category tags */}
        {place.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {place.categories.slice(0, 2).map((c, i) => (
              <span key={i} className="text-[10px] bg-zinc-50 text-zinc-500 border border-zinc-100 px-1.5 py-0.5 rounded-full">
                {c}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm font-semibold text-zinc-800 line-clamp-2 leading-tight mb-1.5">
          {place.name}
        </p>

        <div className="flex items-center justify-between gap-1">
          <StarRating rating={place.rating} count={place.reviewCount} />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {place.price && (
              <span className="text-[11px] text-zinc-400 font-medium">{PRICE_LABELS[place.price]}</span>
            )}
            {place.rating && <RatingBadge rating={place.rating} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLACE DETAIL VIEW
// ─────────────────────────────────────────────────────────────

function PlaceDetail({ place, onBack, onAdd, isAdded, refCoords }) {
  const [full, setFull] = useState(place);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/explore/details/${place.id}`, {
      params: { refLat: refCoords?.lat, refLng: refCoords?.lng },
    })
      .then((res) => { if (res.data.success && res.data.place) setFull(res.data.place); })
      .catch(() => {}) // keep showing list data
      .finally(() => setLoading(false));
  }, [place.id]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Back bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 flex-shrink-0 bg-white">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        {loading && <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin ml-auto" />}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Photo carousel */}
        <div className="h-60 flex-shrink-0">
          <PhotoCarousel photos={full.photos} name={full.name} />
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Name + rating */}
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="text-xl font-bold text-zinc-900 leading-tight flex-1">{full.name}</h2>
              {full.rating && <RatingBadge rating={full.rating} />}
            </div>

            {/* Category tags */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {full.categories.slice(0, 3).map((c, i) => (
                <span key={i} className="text-[11px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>

            {/* Rating row */}
            <div className="flex items-center gap-3 flex-wrap">
              <StarRating rating={full.rating} count={full.reviewCount} size="md" />
              {full.price && <span className="text-sm text-zinc-500 font-medium">{PRICE_LABELS[full.price]}</span>}
              <OpenBadge isOpen={full.isOpen} />
            </div>
          </div>

          {/* Description */}
          {full.description && (
            <p className="text-sm text-zinc-600 leading-relaxed border-l-2 border-rose-200 pl-3 italic">
              {full.description}
            </p>
          )}

          {/* Location */}
          {full.address && (
            <InfoRow icon="📍" label="Location" color="bg-rose-50">
              <p className="text-sm text-zinc-700">{full.address}</p>
              {full.distKm !== null && <p className="text-xs text-zinc-400 mt-0.5">{fmtDist(full.distKm)} from center</p>}
            </InfoRow>
          )}

          {/* Hours */}
          {full.hours && (
            <InfoRow icon="🕐" label="Opening Hours" color="bg-amber-50">
              <p className={`text-xs font-semibold mb-1 ${full.isOpen ? "text-green-600" : "text-red-500"}`}>
                {full.isOpen ? "Open now" : "Currently closed"}
              </p>
              <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">{full.hours}</p>
            </InfoRow>
          )}

          {/* Website */}
          {full.website && (
            <InfoRow icon="🌐" label="Website" color="bg-blue-50">
              <a
                href={full.website.startsWith("http") ? full.website : `https://${full.website}`}
                target="_blank" rel="noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline truncate block"
              >
                {full.website.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            </InfoRow>
          )}

          {/* Phone */}
          {full.phone && (
            <InfoRow icon="📞" label="Phone" color="bg-green-50">
              <a href={`tel:${full.phone}`} className="text-sm text-blue-600 hover:text-blue-700">
                {full.phone}
              </a>
            </InfoRow>
          )}

          {/* Amenities */}
          {full.amenities?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Highlights</p>
              <div className="flex flex-wrap gap-2">
                {full.amenities.map((a) => (
                  <div key={a.label} className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-full px-3 py-1.5">
                    <span className="text-sm">{a.icon}</span>
                    <span className="text-xs font-medium text-zinc-600">{a.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {full.reviews?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Reviews · from Google Maps
              </p>
              <div className="space-y-3">
                {full.reviews.map((r, i) => (
                  <div key={i} className="bg-zinc-50 rounded-2xl p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      {r.authorPhoto ? (
                        <img src={r.authorPhoto} alt={r.author} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-zinc-300 flex items-center justify-center text-[10px] font-bold text-zinc-600">
                          {(r.author || "?")[0]}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-zinc-700">{r.author}</span>
                      <div className="flex items-center gap-0.5 ml-auto">
                        {Array.from({ length: 5 }, (_, j) => (
                          <svg key={j} className={`w-2.5 h-2.5 ${j < r.rating ? "text-amber-400" : "text-zinc-200"}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                          </svg>
                        ))}
                      </div>
                    </div>
                    {r.text && <p className="text-xs text-zinc-600 leading-relaxed line-clamp-4">{r.text}</p>}
                    {r.time && <p className="text-[10px] text-zinc-400 mt-1">{r.time}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-zinc-300 text-center pb-1">Powered by Google Maps</p>
        </div>
      </div>

      {/* CTA Footer */}
      <div className="flex gap-3 px-4 py-3 border-t border-zinc-100 flex-shrink-0 bg-white">
        {full.website && (
          <a
            href={full.website.startsWith("http") ? full.website : `https://${full.website}`}
            target="_blank" rel="noreferrer"
            className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all text-center"
          >
            Website
          </a>
        )}
        <button
          onClick={() => onAdd(full)}
          disabled={isAdded}
          className={`flex-1 text-white text-sm font-semibold py-2.5 rounded-full transition-all flex items-center justify-center gap-2 ${
            isAdded ? "bg-zinc-400 cursor-default" : "bg-rose-500 hover:bg-rose-600 active:bg-rose-700"
          }`}
        >
          {isAdded ? (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg> Added</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg> Add to trip</>
          )}
        </button>
      </div>
    </div>
  );
}

// Small layout helper
function InfoRow({ icon, label, color, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 ${color} rounded-xl flex items-center justify-center flex-shrink-0 text-base mt-0.5`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPLORE MAP (right panel)
// ─────────────────────────────────────────────────────────────

function ExploreMap({ center, places, hoveredId, selectedPlace, onMarkerClick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Init
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !containerRef.current) return;
      window._mapboxgl = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [center.lng, center.lat],
        zoom: 13,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => { if (!cancelled) setMapReady(true); });
      mapRef.current = map;
    })();
    return () => { cancelled = true; };
  }, []);

  // Fly to new center
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: 13, duration: 800 });
  }, [center.lat, center.lng, mapReady]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const mapboxgl = window._mapboxgl;
    if (!mapboxgl) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    places.forEach((place) => {
      if (!place.lat || !place.lng) return;

      const isSelected = selectedPlace?.id === place.id;
      const isHovered = hoveredId === place.id;

      const el = document.createElement("div");
      el.style.cssText = "cursor:pointer;transform-origin:center bottom;transition:transform 0.15s ease;";
      if (isHovered || isSelected) el.style.transform = "scale(1.3)";

      const bg = isSelected ? "#ef4444" : "#1f2937";
      const label = place.rating ? `${parseFloat(place.rating).toFixed(1)}★` : "📍";

      el.innerHTML = `
        <div style="
          background:${bg};color:white;
          font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;
          padding:4px 9px;border-radius:20px;
          box-shadow:0 2px 10px rgba(0,0,0,0.3);
          border:2.5px solid white;white-space:nowrap;
          transition:background 0.15s;
        ">${label}</div>
        <div style="width:2px;height:5px;background:${bg};margin:0 auto;border-radius:0 0 2px 2px;"></div>
      `;

      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.2)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = isSelected ? "scale(1.3)" : "scale(1)"; });

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onMarkerClick(place);

        if (popupRef.current) popupRef.current.remove();

        const popup = new mapboxgl.Popup({
          offset: 28,
          closeButton: true,
          maxWidth: "260px",
          className: "explore-popup",
        })
          .setLngLat([place.lng, place.lat])
          .setHTML(`
            <div style="font-family:-apple-system,sans-serif;width:240px;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
              ${place.photo
                ? `<img src="${place.photo}" style="width:100%;height:120px;object-fit:cover;" onerror="this.style.display='none'" />`
                : `<div style="width:100%;height:80px;background:#f4f4f5;display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.3;">📍</div>`
              }
              <div style="padding:10px 12px 12px;">
                <p style="font-size:13px;font-weight:700;color:#18181b;margin:0 0 3px;line-height:1.3;">${place.name}</p>
                ${place.categories[0] ? `<p style="font-size:11px;color:#71717a;margin:0 0 6px;">${place.categories.slice(0, 2).join(" · ")}</p>` : ""}
                <div style="display:flex;align-items:center;gap:6px;">
                  ${place.rating
                    ? `<span style="background:${parseFloat(place.rating) >= 4.5 ? "#22c55e" : parseFloat(place.rating) >= 4 ? "#84cc16" : "#f59e0b"};color:white;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;">${parseFloat(place.rating).toFixed(1)} ★</span>`
                    : ""
                  }
                  ${place.reviewCount ? `<span style="font-size:11px;color:#a1a1aa;">(${place.reviewCount >= 1000 ? (place.reviewCount/1000).toFixed(1)+"k" : place.reviewCount})</span>` : ""}
                  ${place.isOpen !== null ? `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:20px;${place.isOpen ? "background:#dcfce7;color:#16a34a" : "background:#fee2e2;color:#dc2626"}">${place.isOpen ? "Open" : "Closed"}</span>` : ""}
                </div>
                ${place.distKm !== null ? `<p style="font-size:10px;color:#a1a1aa;margin:4px 0 0;">${place.distKm < 1 ? Math.round(place.distKm*1000)+"m" : place.distKm+"km"} away</p>` : ""}
              </div>
            </div>
          `)
          .addTo(mapRef.current);
        popupRef.current = popup;
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([place.lng, place.lat])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [places, mapReady, hoveredId, selectedPlace]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPLORE TAB
// ─────────────────────────────────────────────────────────────

export default function ExploreTab({ trip, isMember, onAddToItinerary }) {
  const [activeCategory, setActiveCategory] = useState("stays");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("distance");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());
  const [cityInput, setCityInput] = useState(trip.destination?.name || "");
  const [cityLabel, setCityLabel] = useState(trip.destination?.name || "");
  const [mobileMapView, setMobileMapView] = useState(false); // mobile: toggle list vs map
  const [searchCoords, setSearchCoords] = useState(
    trip.destination?.coordinates?.lat
      ? { lat: trip.destination.coordinates.lat, lng: trip.destination.coordinates.lng }
      : null
  );

  const sortMenuRef = useRef(null);
  const didAutoLoad = useRef(false);
  const cat = CATEGORIES[activeCategory];

  // Close sort menu on outside click
  useEffect(() => {
    const h = (e) => { if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sortResults = useCallback((data, sort) => {
    const sorted = [...data];
    if (sort === "rating") sorted.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    else if (sort === "reviews") sorted.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    else sorted.sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999));
    return sorted;
  }, []);

  const doSearch = useCallback(async (lat, lng, kind = activeCategory, sort = sortBy) => {
    setLoading(true);
    setError("");
    setSelectedPlace(null);
    setPlaces([]);
    try {
      const res = await api.get("/explore/search", {
        params: { ll: `${lat},${lng}`, kind, radius: 3000 },
      });
      if (!res.data.success) {
        setError(res.data.message || "No results found.");
        return;
      }
      const sorted = sortResults(res.data.results || [], sort);
      setPlaces(sorted);
      if (!sorted.length) setError(`No ${CATEGORIES[kind].label.toLowerCase()} found nearby. Try a different city.`);
    } catch (e) {
      const msg = e.response?.data?.message || "Failed to load places. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sortBy, sortResults]);

  // Auto-search on mount
  useEffect(() => {
    if (!didAutoLoad.current && searchCoords) {
      didAutoLoad.current = true;
      doSearch(searchCoords.lat, searchCoords.lng);
    }
  }, [searchCoords]);

  const handleCategoryChange = (key) => {
    setActiveCategory(key);
    setSelectedPlace(null);
    setPlaces([]);
    if (searchCoords) doSearch(searchCoords.lat, searchCoords.lng, key, sortBy);
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    setShowSortMenu(false);
    setPlaces(prev => sortResults(prev, sort));
  };

  const handleCitySearch = async () => {
    if (!cityInput.trim()) return;
    setLoading(true);
    try {
      const geo = await geocodeCity(cityInput.trim());
      if (!geo) { setError("City not found. Try a different name."); setLoading(false); return; }
      setSearchCoords(geo);
      setCityLabel(cityInput.trim());
      await doSearch(geo.lat, geo.lng, activeCategory, sortBy);
    } catch {
      setError("Search failed. Try again.");
      setLoading(false);
    }
  };

  const handleAddToTrip = (place) => {
    if (!onAddToItinerary) return;
    const cid = "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    onAddToItinerary({
      _id: cid, clientId: cid,
      type: cat.itemType,
      title: place.name,
      region: place.address || cityLabel || "",
      lat: place.lat,
      lng: place.lng,
      placeId: place.id,
      date: "", time: "", endDate: "", endTime: "",
      price: place.price ? PRICE_LABELS[place.price] : "",
      currency: "INR",
      notes: [
        place.description || "",
        place.hours ? `🕐 Hours: ${place.hours.split("\n").slice(0,3).join(" | ")}` : "",
        place.website ? `🌐 ${place.website}` : "",
        place.phone ? `📞 ${place.phone}` : "",
        place.rating ? `⭐ ${place.rating} (${place.reviewCount} reviews)` : "",
      ].filter(Boolean).join("\n"),
      bookingRef: "",
      transportMode: undefined,
      fromStation: "", toStation: "",
    });
    setAddedIds(prev => new Set([...prev, place.id]));
  };

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 w-full">
        <div className="text-4xl">🔒</div>
        <p className="text-sm font-medium text-zinc-600">Members only</p>
      </div>
    );
  }

  const mapCenter = searchCoords || { lat: 20.5937, lng: 78.9629 };
  const sortLabel = SORT_OPTIONS.find(s => s.value === sortBy)?.label || "Distance";
  const mapPlaces = selectedPlace ? [selectedPlace] : places;

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden w-full">

      {/* ── Category sidebar (vertical on desktop, horizontal scroll on mobile) ── */}
      <div className="flex md:flex-col md:w-[72px] flex-shrink-0 border-b md:border-b-0 md:border-r border-zinc-100 md:items-center py-2 md:py-4 gap-1 bg-white overflow-x-auto md:overflow-visible">
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <button
            key={key}
            onClick={() => handleCategoryChange(key)}
            className={`flex flex-col items-center gap-1 flex-shrink-0 md:w-full px-4 md:px-1 py-2 md:py-3 rounded-xl transition-all ${
              activeCategory === key
                ? "bg-rose-50 text-rose-600"
                : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span className="text-xl leading-none">{c.icon}</span>
            <span className="text-[10px] font-semibold leading-tight text-center">{c.label}</span>
          </button>
        ))}
      </div>

      {/* ── List / Detail panel ── */}
      <div className={`w-full md:w-[360px] flex-1 md:flex-none flex-shrink-0 flex-col overflow-hidden border-r border-zinc-100 ${mobileMapView ? "hidden md:flex" : "flex"}`}>
        {selectedPlace ? (
          <PlaceDetail
            place={selectedPlace}
            onBack={() => setSelectedPlace(null)}
            onAdd={handleAddToTrip}
            isAdded={addedIds.has(selectedPlace.id)}
            refCoords={searchCoords}
          />
        ) : (
          <>
            {/* Search bar */}
            <div className="px-3 pt-3 pb-2 border-b border-zinc-100 space-y-2 flex-shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white border border-zinc-200 focus-within:border-rose-400 rounded-xl px-3 py-2 transition-colors">
                  <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  <input
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCitySearch()}
                    placeholder="City or destination..."
                    className="flex-1 text-sm outline-none bg-transparent text-zinc-700 placeholder-zinc-400"
                  />
                  {cityInput && (
                    <button onClick={() => setCityInput("")} className="text-zinc-300 hover:text-zinc-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={handleCitySearch}
                  disabled={loading || !cityInput.trim()}
                  className="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold px-4 rounded-xl transition-colors"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : "Go"}
                </button>
              </div>

              {/* Sort + count */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400 font-medium">
                  {loading
                    ? "Searching..."
                    : places.length > 0
                    ? `${places.length} ${cat.label.toLowerCase()} · ${cityLabel}`
                    : ""}
                </p>
                <div className="relative" ref={sortMenuRef}>
                  <button
                    onClick={() => setShowSortMenu(v => !v)}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 rounded-xl px-2.5 py-1.5 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/>
                    </svg>
                    <span className="font-semibold text-zinc-700">{sortLabel}</span>
                    <svg className={`w-3 h-3 transition-transform ${showSortMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-30 overflow-hidden min-w-[160px]">
                      {SORT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleSortChange(opt.value)}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            sortBy === opt.value
                              ? "bg-rose-50 text-rose-600 font-semibold"
                              : "text-zinc-700 hover:bg-zinc-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {/* Loading skeletons */}
              {loading && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-zinc-400">Top suggestions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 animate-pulse">
                        <div className="h-40 bg-zinc-200"/>
                        <div className="p-3 space-y-2">
                          <div className="flex gap-1">
                            <div className="h-3 bg-zinc-200 rounded-full w-16"/>
                            <div className="h-3 bg-zinc-200 rounded-full w-12"/>
                          </div>
                          <div className="h-4 bg-zinc-200 rounded w-4/5"/>
                          <div className="h-3 bg-zinc-200 rounded w-2/3"/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <span className="text-4xl">😕</span>
                  <p className="text-sm text-zinc-500 max-w-[240px] leading-relaxed">{error}</p>
                  {searchCoords && (
                    <button
                      onClick={() => doSearch(searchCoords.lat, searchCoords.lng)}
                      className="text-xs text-rose-500 hover:text-rose-600 font-medium border border-rose-200 rounded-full px-4 py-1.5 transition-colors"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}

              {/* Empty */}
              {!loading && !error && places.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <span className="text-5xl">{cat.icon}</span>
                  <p className="text-sm font-semibold text-zinc-600">Find {cat.label.toLowerCase()}</p>
                  <p className="text-xs text-zinc-400 text-center max-w-[200px]">
                    Enter a city above to discover {cat.label.toLowerCase()} near you
                  </p>
                </div>
              )}

              {/* Grid */}
              {!loading && !error && places.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-zinc-400">
                    Top suggestions · {cityLabel}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {places.map(place => (
                      <PlaceCard
                        key={place.id}
                        place={place}
                        onSelect={setSelectedPlace}
                        onAdd={handleAddToTrip}
                        isAdded={addedIds.has(place.id)}
                        isHovered={hoveredId === place.id}
                        onHover={setHoveredId}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-300 text-center pt-1 pb-2">
                    Powered by Google Maps
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Map panel ── */}
      <div className={`flex-1 relative overflow-hidden ${mobileMapView ? "block" : "hidden md:block"}`}>
        {searchCoords && MAPBOX_TOKEN ? (
          <ExploreMap
            center={mapCenter}
            places={mapPlaces}
            hoveredId={hoveredId}
            selectedPlace={selectedPlace}
            onMarkerClick={setSelectedPlace}
          />
        ) : (
          <div className="w-full h-full bg-zinc-50 flex flex-col items-center justify-center gap-3">
            <div className="absolute inset-0 opacity-[0.05]"
              style={{ backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)", backgroundSize: "24px 24px" }}
            />
            <div className="relative text-center">
              <span className="text-6xl opacity-10">🗺️</span>
              <p className="text-sm text-zinc-400 mt-3 font-medium">Map loads after search</p>
              <p className="text-xs text-zinc-300 mt-1">Enter a city to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-only: toggle between the results list and the map */}
      {!selectedPlace && (
        <button
          onClick={() => setMobileMapView((v) => !v)}
          className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-zinc-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-xl active:scale-95 transition-transform"
        >
          {mobileMapView ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              List
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              Map
            </>
          )}
        </button>
      )}
    </div>
  );
}