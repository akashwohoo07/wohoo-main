import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import InviteModal from "../components/InviteModal";
import ExploreTab from "./trip/ExploreTab";
import PlanTab from "./trip/PlanTab";
import { NotesTab, FilesTab } from "./trip/TripTabs";

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton({ className }) {
  return <div className={`bg-zinc-100 animate-pulse rounded-xl ${className}`} />;
}
function TripSkeleton() {
  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <div className="h-14 border-b border-zinc-100 flex items-center px-6 gap-4 flex-shrink-0">
        <Skeleton className="w-6 h-6 rounded" />
        <Skeleton className="w-32 h-5" />
        <Skeleton className="w-28 h-7 rounded-lg ml-2" />
      </div>
      <div className="flex gap-2 px-6 pt-3 pb-0 border-b border-zinc-100 flex-shrink-0">
        {["Explore", "Plan", "Notes", "Files"].map((t) => <Skeleton key={t} className="w-16 h-4 mb-3" />)}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[420px] border-r border-zinc-100 p-6 space-y-4 flex-shrink-0">
          <Skeleton className="w-full h-48 rounded-2xl" />
          <Skeleton className="w-48 h-6" />
          <Skeleton className="w-32 h-4" />
        </div>
        <div className="flex-1 bg-zinc-50" />
      </div>
    </div>
  );
}

// ── Leg colour palette ────────────────────────────────────────
const LEG_COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// ── Great-circle arc interpolation ───────────────────────────
// Generates N intermediate points along a great circle between two lat/lng pairs
// This gives the curved arc that flights take over a globe
function greatCircleArc(lat1, lng1, lat2, lng2, steps = 80) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1), λ1 = toRad(lng1);
  const φ2 = toRad(lat2), λ2 = toRad(lng2);

  // Angular distance
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
    )
  );

  if (d === 0) return [[lng1, lat1], [lng2, lat2]];

  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2));
    const λ = Math.atan2(y, x);
    coords.push([toDeg(λ), toDeg(φ)]);
  }
  return coords;
}

// ── MAP ───────────────────────────────────────────────────────
function TripMap({ destination, markers = [], transportLegs = [] }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const transportMarkersRef = useRef([]); // start/end airport/station markers
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [legVisible, setLegVisible] = useState(null); // null = all, Set of visible indices
  const [showTransportLegs, setShowTransportLegs] = useState(true);
  const [transportLegVisible, setTransportLegVisible] = useState(null); // null = all visible

  // Selected transport arc for detail popup
  const [selectedTransport, setSelectedTransport] = useState(null); // { item, x, y } — screen position

  // Explore overlay
  const [exploreFilter, setExploreFilter] = useState(null);
  const [explorePlaces, setExplorePlaces] = useState([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const exploreMarkersRef = useRef([]);

  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  const EXPLORE_FILTERS = [
    { id: "stays",      label: "Stays",      icon: "🛏️", color: "#3b82f6" },
    { id: "activities", label: "Activities", icon: "🎯", color: "#8b5cf6" },
    { id: "eats",       label: "Eats",       icon: "🍽️", color: "#f59e0b" },
  ];

  const lat = destination?.coordinates?.lat;
  const lng = destination?.coordinates?.lng;

  const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m)} m`;
  const fmtDur = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  // Great-circle distance in km
  const gcDist = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  // ── Marker creation helpers ─────────────────────────────────
  const createMainMarkerEl = () => {
    const el = document.createElement("div");
    el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.30));";
    el.innerHTML = `<svg width="26" height="34" viewBox="0 0 24 32" fill="none">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 8 12 20 12 20s12-12 12-20C24 5.373 18.627 0 12 0z" fill="#ef4444"/>
      <circle cx="12" cy="12" r="5" fill="white"/>
    </svg>`;
    return el;
  };

  const createStopMarkerEl = (stops, colors) => {
    const el = document.createElement("div");
    el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";
    const badges = stops.map((n, i) =>
      `<div style="
        min-width:20px;height:20px;border-radius:10px;padding:0 4px;
        background:${colors[i] || "#18181b"};color:white;
        display:inline-flex;align-items:center;justify-content:center;
        font-family:sans-serif;font-size:10px;font-weight:800;
        border:2px solid white;
        margin-left:${i === 0 ? "0" : "-3px"};
        position:relative;z-index:${10 - i};
        box-shadow:0 1px 3px rgba(0,0,0,0.25);
      ">${n}</div>`
    ).join("");
    el.innerHTML = `
      <div class="stop-badges" style="display:flex;align-items:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.18));">${badges}</div>
      <div class="stop-stem" style="width:2px;height:5px;background:${colors[0] || "#18181b"};margin-top:-1px;border-radius:0 0 2px 2px;opacity:0.85;"></div>`;
    return el;
  };

  // Transport endpoint marker (airport or station)
  const createTransportEndpointEl = (icon, color) => {
    const el = document.createElement("div");
    el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";
    el.innerHTML = `
      <div style="
        background:${color};color:white;
        font-size:13px;
        width:28px;height:28px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        border:2.5px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.22);
      ">${icon}</div>
      <div style="width:2px;height:4px;background:${color};margin-top:-1px;border-radius:0 0 2px 2px;opacity:0.7;"></div>
    `;
    return el;
  };

  // ── Draw destination route legs (road-following) ──────────
  const drawRoute = async (destMarkers, visible = true) => {
    const map = mapInstance.current;
    if (!map) return;

    for (let i = 0; i < 24; i++) {
      if (map.getLayer(`leg-line-${i}`)) map.removeLayer(`leg-line-${i}`);
      if (map.getLayer(`leg-border-${i}`)) map.removeLayer(`leg-border-${i}`);
      if (map.getSource(`leg-${i}`)) map.removeSource(`leg-${i}`);
    }

    if (destMarkers.length < 2 || !visible) { setRouteInfo(null); return; }

    setRouteLoading(true);
    try {
      const legResults = await Promise.all(
        destMarkers.slice(0, -1).map(async (from, i) => {
          const to = destMarkers[i + 1];
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&steps=false&access_token=${token}`;
          const res = await fetch(url);
          const data = await res.json();
          return data.routes?.[0] || null;
        })
      );

      let totalDistance = 0, totalDuration = 0;
      const legs = [];

      legResults.forEach((route, i) => {
        if (!route) return;
        const color = LEG_COLORS[i % LEG_COLORS.length];
        const offset = (i - Math.floor(legResults.length / 2)) * 4;

        map.addSource(`leg-${i}`, { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
        map.addLayer({
          id: `leg-border-${i}`, type: "line", source: `leg-${i}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.6, "line-offset": offset },
        });
        map.addLayer({
          id: `leg-line-${i}`, type: "line", source: `leg-${i}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": 4.5, "line-opacity": 0.95, "line-offset": offset },
        });

        totalDistance += route.distance;
        totalDuration += route.duration;
        legs.push({ from: destMarkers[i]?.title || `Stop ${i + 1}`, to: destMarkers[i + 1]?.title || `Stop ${i + 2}`, distance: route.distance, duration: route.duration, color });
      });

      setRouteInfo({ totalDistance, totalDuration, legs });
      setLegVisible(null);
      setShowRoutePanel(true);
    } catch (err) {
      console.error("Route fetch error:", err);
    } finally {
      setRouteLoading(false);
    }
  };

  // ── Draw transport arcs (flight = great-circle, train = straight) ──
  const drawTransportArcs = (tLegs, visible = true) => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous transport layers
    for (let i = 0; i < 40; i++) {
      if (map.getLayer(`transport-arc-${i}`)) map.removeLayer(`transport-arc-${i}`);
      if (map.getLayer(`transport-arc-bg-${i}`)) map.removeLayer(`transport-arc-bg-${i}`);
      if (map.getSource(`transport-arc-src-${i}`)) map.removeSource(`transport-arc-src-${i}`);
    }

    // Clear previous endpoint markers
    transportMarkersRef.current.forEach((m) => m.remove());
    transportMarkersRef.current = [];

    if (!visible || !tLegs.length) return;

    const mapboxgl = window._mapboxgl;
    if (!mapboxgl) return;

    tLegs.forEach((leg, i) => {
      if (!leg.fromLat || !leg.fromLng || !leg.toLat || !leg.toLng) return;

      const isFlight = leg.transportMode === "flight";
      const isTrain = leg.transportMode === "train";
      const color = leg.color || LEG_COLORS[i % LEG_COLORS.length];

      // Arc coordinates: great circle for flights, straight line for trains/others
      const coords = isFlight
        ? greatCircleArc(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng, 80)
        : [[leg.fromLng, leg.fromLat], [leg.toLng, leg.toLat]];

      map.addSource(`transport-arc-src-${i}`, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { transportIdx: i },
          geometry: { type: "LineString", coordinates: coords },
        },
      });

      // White background stroke
      map.addLayer({
        id: `transport-arc-bg-${i}`,
        type: "line",
        source: `transport-arc-src-${i}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": isFlight ? 7 : 6,
          "line-opacity": 0.7,
          ...(isFlight ? {} : { "line-dasharray": [] }),
        },
      });

      // Coloured arc (dashed for train, solid for flight)
      map.addLayer({
        id: `transport-arc-${i}`,
        type: "line",
        source: `transport-arc-src-${i}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": color,
          "line-width": isFlight ? 3.5 : 3,
          "line-opacity": 0.92,
          ...(isTrain ? { "line-dasharray": [4, 2] } : {}),
        },
      });

      // Click handler on the arc — show detail card
      map.on("click", `transport-arc-${i}`, (e) => {
        const point = e.point; // screen {x, y}
        setSelectedTransport({ leg, screenX: point.x, screenY: point.y });
      });

      map.on("mouseenter", `transport-arc-${i}`, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", `transport-arc-${i}`, () => {
        map.getCanvas().style.cursor = "";
      });

      // Endpoint markers (airport / station icons)
      const fromIcon = isFlight ? "✈" : isTrain ? "🚂" : "●";
      const toIcon = isFlight ? "🛬" : isTrain ? "🚉" : "●";

      const fromEl = createTransportEndpointEl(fromIcon, color);
      const fromPopupHtml = `<div style="font-family:sans-serif;padding:6px 8px;min-width:120px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:2px;">${isFlight ? "DEPARTURE" : "FROM"}</div>
        <div style="font-size:13px;font-weight:700;color:#18181b;">${leg.fromStation || "—"}</div>
        ${leg.time ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px;">🕐 ${leg.time}</div>` : ""}
      </div>`;
      new mapboxgl.Marker({ element: fromEl, anchor: "bottom" })
        .setLngLat([leg.fromLng, leg.fromLat])
        .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(fromPopupHtml))
        .addTo(map);
      transportMarkersRef.current.push(
        new mapboxgl.Marker({ element: fromEl, anchor: "bottom" })
          .setLngLat([leg.fromLng, leg.fromLat])
      );

      const toEl = createTransportEndpointEl(toIcon, color);
      const toPopupHtml = `<div style="font-family:sans-serif;padding:6px 8px;min-width:120px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:2px;">${isFlight ? "ARRIVAL" : "TO"}</div>
        <div style="font-size:13px;font-weight:700;color:#18181b;">${leg.toStation || "—"}</div>
        ${leg.endTime ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px;">🕐 ${leg.endTime}</div>` : ""}
      </div>`;
      const toMarker = new mapboxgl.Marker({ element: toEl, anchor: "bottom" })
        .setLngLat([leg.toLng, leg.toLat])
        .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(toPopupHtml))
        .addTo(map);
      transportMarkersRef.current.push(toMarker);
    });
  };

  // ── Visibility helpers ─────────────────────────────────────
  const applyRouteVisibility = (globalOn, perLeg) => {
    const map = mapInstance.current;
    if (!map) return;
    for (let i = 0; i < 24; i++) {
      if (!map.getLayer(`leg-line-${i}`)) continue;
      const legOn = globalOn && (perLeg === null || perLeg.has(i));
      const v = legOn ? "visible" : "none";
      map.setLayoutProperty(`leg-line-${i}`, "visibility", v);
      map.setLayoutProperty(`leg-border-${i}`, "visibility", v);
    }
  };

  const applyTransportVisibility = (globalOn, perLeg) => {
    const map = mapInstance.current;
    if (!map) return;
    for (let i = 0; i < 40; i++) {
      if (!map.getLayer(`transport-arc-${i}`)) continue;
      const legOn = globalOn && (perLeg === null || perLeg.has(i));
      const v = legOn ? "visible" : "none";
      map.setLayoutProperty(`transport-arc-${i}`, "visibility", v);
      map.setLayoutProperty(`transport-arc-bg-${i}`, "visibility", v);
    }
    // Endpoint markers
    transportMarkersRef.current.forEach((m, i) => {
      const markerLegIdx = Math.floor(i / 2);
      const legOn = globalOn && (perLeg === null || perLeg.has(markerLegIdx));
      const el = m.getElement();
      if (el) el.style.visibility = legOn ? "visible" : "hidden";
    });
  };

  const applyNumberVisibility = (visible) => {
    markersRef.current.forEach((m) => {
      const el = m.getElement();
      const badges = el.querySelector(".stop-badges");
      const stem = el.querySelector(".stop-stem");
      if (badges) badges.style.opacity = visible ? "1" : "0";
      if (stem) stem.style.opacity = visible ? "0.85" : "0";
    });
  };

  useEffect(() => { if (mapReady) applyRouteVisibility(showRoutes, legVisible); }, [showRoutes, legVisible, mapReady]);
  useEffect(() => { if (mapReady) applyTransportVisibility(showTransportLegs, transportLegVisible); }, [showTransportLegs, transportLegVisible, mapReady]);
  useEffect(() => { if (mapReady) applyNumberVisibility(showNumbers); }, [showNumbers, mapReady]);

  // ── Explore overlay ──────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const mapboxgl = window._mapboxgl;
    if (!mapboxgl) return;

    exploreMarkersRef.current.forEach(m => m.remove());
    exploreMarkersRef.current = [];

    if (!exploreFilter || !lat || !lng) return;

    setExploreLoading(true);

    import("../api/axios").then(({ default: api }) => {
      api.get("/explore/search", {
        params: { ll: `${lat},${lng}`, kind: exploreFilter, radius: 5000 },
      }).then(res => {
        const places = res.data.results || [];
        setExplorePlaces(places);

        const filterMeta = EXPLORE_FILTERS.find(f => f.id === exploreFilter);
        const color = filterMeta?.color || "#ef4444";

        places.forEach(place => {
          if (!place.lat || !place.lng) return;

          const el = document.createElement("div");
          el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";
          el.innerHTML = `
            <div style="
              background:${color};color:white;
              font-family:sans-serif;font-size:10px;font-weight:700;
              padding:3px 8px;border-radius:16px;
              border:2px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.25);
              white-space:nowrap;
            ">${place.rating ? parseFloat(place.rating).toFixed(1)+"★" : filterMeta?.icon || "•"}</div>
            <div style="width:2px;height:4px;background:${color};margin:0 auto;border-radius:0 0 2px 2px;"></div>
          `;

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: true, maxWidth: "240px" })
            .setHTML(`
              <div style="font-family:sans-serif;width:220px;">
                ${place.photo ? `<img src="${place.photo}" style="width:100%;height:110px;object-fit:cover;border-radius:8px 8px 0 0;" onerror="this.style.display='none'"/>` : ""}
                <div style="padding:10px 12px;">
                  <p style="font-size:13px;font-weight:700;color:#18181b;margin:0 0 3px;">${place.name}</p>
                  ${place.categories?.[0] ? `<p style="font-size:11px;color:#71717a;margin:0 0 5px;">${place.categories.slice(0,2).join(" · ")}</p>` : ""}
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${place.rating ? `<span style="background:${parseFloat(place.rating)>=4?"#22c55e":"#f59e0b"};color:white;font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px;">${parseFloat(place.rating).toFixed(1)}★</span>` : ""}
                    ${place.isOpen !== null ? `<span style="font-size:10px;font-weight:600;${place.isOpen ? "color:#16a34a" : "color:#dc2626"}">${place.isOpen ? "● Open" : "● Closed"}</span>` : ""}
                  </div>
                  ${place.address ? `<p style="font-size:10px;color:#a1a1aa;margin:5px 0 0;">📍 ${place.address}</p>` : ""}
                </div>
              </div>
            `);

          const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([place.lng, place.lat])
            .setPopup(popup)
            .addTo(mapInstance.current);

          exploreMarkersRef.current.push(marker);
        });
      }).catch(console.error).finally(() => setExploreLoading(false));
    });
  }, [exploreFilter, mapReady, lat, lng]);

  // ── Reactive: redraw markers + routes + transport arcs ────
  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;
    const mapboxgl = window._mapboxgl;
    if (!mapboxgl) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const validMarkers = markers.filter((m) => m.lat && m.lng);

    const locationMap = new Map();
    validMarkers.forEach((item, idx) => {
      const key = item.placeId || `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (!locationMap.has(key)) locationMap.set(key, { item, entries: [] });
      locationMap.get(key).entries.push({ stopNum: idx + 1, legIdx: Math.max(0, idx - 1) });
    });

    locationMap.forEach(({ item, entries }) => {
      const stops = entries.map((e) => e.stopNum);
      const colors = entries.map((e) => LEG_COLORS[e.legIdx % LEG_COLORS.length]);
      const el = createStopMarkerEl(stops, colors);
      const allStopLabels = stops.map((n) => `Stop ${n}`).join(", ");

      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([item.lng, item.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(
            `<div style="font-family:sans-serif;padding:5px 8px;">
              <div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:2px;">${allStopLabels}</div>
              <div style="font-size:13px;font-weight:700;color:#18181b;">${item.title}</div>
              ${item.region ? `<div style="font-size:11px;color:#a1a1aa;margin-top:1px;">${item.region}</div>` : ""}
            </div>`
          )
        )
        .addTo(mapInstance.current);
      markersRef.current.push(marker);
    });

    applyNumberVisibility(showNumbers);
    setLegVisible(null);
    drawRoute(validMarkers, showRoutes);

    // Draw transport arcs
    drawTransportArcs(transportLegs, showTransportLegs);
    setTransportLegVisible(null);

    // Fit bounds to include both destination markers and transport endpoints
    const allPoints = [
      ...(lat && lng ? [[lng, lat]] : []),
      ...Array.from(locationMap.values()).map(({ item: m }) => [m.lng, m.lat]),
      ...transportLegs.flatMap(l => {
        const pts = [];
        if (l.fromLat && l.fromLng) pts.push([l.fromLng, l.fromLat]);
        if (l.toLat && l.toLng) pts.push([l.toLng, l.toLat]);
        return pts;
      }),
    ];

    if (allPoints.length > 1) {
      const bounds = allPoints.reduce(
        (b, p) => b.extend(p),
        new mapboxgl.LngLatBounds(allPoints[0], allPoints[0])
      );
      mapInstance.current.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 700 });
    } else if (allPoints.length === 1) {
      mapInstance.current.flyTo({ center: allPoints[0], zoom: 12, duration: 600 });
    }
  }, [markers, transportLegs, mapReady]);

  // ── Init map once ─────────────────────────────────────────
  useEffect(() => {
    if (!token || !mapRef.current || mapInstance.current) return;
    let cancelled = false;
    const initMap = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        window._mapboxgl = mapboxgl;
        if (cancelled || !mapRef.current) return;
        mapboxgl.accessToken = token;
        const center = lat && lng ? [lng, lat] : [77.1886, 32.2396];
        const map = new mapboxgl.Map({
          container: mapRef.current, style: "mapbox://styles/mapbox/streets-v12",
          center, zoom: lat && lng ? 10 : 4, attributionControl: false,
        });
        map.addControl(new mapboxgl.AttributionControl({ compact: true }));
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        if (lat && lng) {
          const el = createMainMarkerEl();
          new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup({ offset: 30, closeButton: false }).setHTML(
              `<div style="font-family:sans-serif;font-size:13px;font-weight:700;color:#18181b;padding:3px 5px;">${destination?.name || "Trip destination"}</div>`
            ))
            .addTo(map);
        }
        // Click on map canvas (not a layer) → close transport detail
        map.on("click", (e) => {
          if (!e.defaultPrevented) setSelectedTransport(null);
        });
        map.on("load", () => { if (!cancelled) setMapReady(true); });
        mapInstance.current = map;
      } catch (err) {
        console.error("Map load error:", err);
        if (!cancelled) setMapError(true);
      }
    };
    initMap();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      transportMarkersRef.current.forEach((m) => m.remove());
      transportMarkersRef.current = [];
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [token, lat, lng]);

  if (!token) return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-50">
      <div className="text-4xl">🗺️</div>
      <p className="text-sm text-zinc-500 font-medium">Map not configured</p>
      <p className="text-xs text-zinc-400">Add VITE_MAPBOX_TOKEN to client/.env</p>
    </div>
  );
  if (mapError) return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-50">
      <div className="text-4xl">⚠️</div>
      <p className="text-sm text-zinc-500">Failed to load map</p>
    </div>
  );

  const routeDestCount = markers.filter((m) => m.lat && m.lng).length;
  const hasTransportArcs = transportLegs.some(l => l.fromLat && l.toLat);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {!mapReady && (
        <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
            <p className="text-xs text-zinc-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Explore filter buttons */}
      {mapReady && lat && lng && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-[calc(100%-7rem)]">
          <div className="flex flex-wrap gap-1.5">
            {EXPLORE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setExploreFilter(prev => prev === f.id ? null : f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-md transition-all border-2 ${
                  exploreFilter === f.id
                    ? "text-white border-white shadow-lg"
                    : "bg-white text-zinc-700 border-white hover:shadow-lg"
                }`}
                style={exploreFilter === f.id ? { background: f.color, borderColor: "white" } : {}}
              >
                {exploreLoading && exploreFilter === f.id ? (
                  <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                ) : (
                  <span>{f.icon}</span>
                )}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Route + Transport button */}
      {mapReady && (routeDestCount >= 2 || hasTransportArcs) && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setShowRoutePanel((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-md text-sm font-medium transition-all ${
              showRoutePanel ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {routeLoading
              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            }
            Routes
            {routeInfo && !routeLoading && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${showRoutePanel ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-600"}`}>
                {fmtDist(routeInfo.totalDistance)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Route panel — destination legs + transport legs */}
      {showRoutePanel && (
        <div className="absolute top-16 right-4 z-10 bg-white rounded-2xl shadow-xl border border-zinc-100 w-[calc(100vw-2rem)] max-w-[300px] overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-3 bg-zinc-900 flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-sm">Routes</p>
              {routeInfo && (
                <p className="text-zinc-400 text-xs mt-0.5">{fmtDist(routeInfo.totalDistance)} · {fmtDur(routeInfo.totalDuration)} driving</p>
              )}
            </div>
            <button onClick={() => setShowRoutePanel(false)} className="text-zinc-500 hover:text-white transition-colors ml-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Global toggles */}
          <div className="flex border-b border-zinc-100">
            <button
              onClick={() => { setShowRoutes((v) => { if (!v) setLegVisible(null); return !v; }); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-r border-zinc-100 ${showRoutes ? "text-zinc-700 bg-white" : "text-zinc-400 bg-zinc-50"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              {showRoutes ? "Roads on" : "Roads off"}
            </button>
            <button
              onClick={() => setShowNumbers((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${showNumbers ? "text-zinc-700 bg-white" : "text-zinc-400 bg-zinc-50"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
              {showNumbers ? "Numbers on" : "Numbers off"}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">

            {/* ── Destination driving legs ── */}
            {routeInfo && routeInfo.legs.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Road legs</p>
                </div>
                <div className="divide-y divide-zinc-50">
                  {routeInfo.legs.map((leg, i) => {
                    const nextColor = LEG_COLORS[(i + 1) % LEG_COLORS.length];
                    const thisLegOn = legVisible === null || legVisible.has(i);

                    const toggleThisLeg = () => {
                      setLegVisible((prev) => {
                        const total = routeInfo.legs.length;
                        const current = prev === null
                          ? new Set(Array.from({ length: total }, (_, k) => k))
                          : new Set(prev);
                        if (current.has(i)) current.delete(i);
                        else current.add(i);
                        return current.size === total ? null : current;
                      });
                    };

                    return (
                      <div key={i} className={`px-4 py-3 transition-colors ${!thisLegOn || !showRoutes ? "opacity-40" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                            <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-white flex-shrink-0"
                              style={{ background: leg.color, fontSize: "9px", fontWeight: 800 }}>
                              {i + 1}
                            </div>
                            <div className="w-0.5 my-1 flex-1" style={{ background: leg.color, minHeight: "12px", opacity: 0.35 }} />
                            <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-white flex-shrink-0"
                              style={{ background: nextColor, fontSize: "9px", fontWeight: 800 }}>
                              {i + 2}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-zinc-800 truncate leading-tight">{leg.from}</p>
                            <div className="flex items-center gap-1.5 my-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: leg.color }} />
                              <span className="text-[11px] font-semibold" style={{ color: leg.color }}>{fmtDist(leg.distance)}</span>
                              <span className="text-zinc-300 text-[10px]">·</span>
                              <span className="text-[11px] text-zinc-400">{fmtDur(leg.duration)}</span>
                            </div>
                            <p className="text-[12px] font-semibold text-zinc-800 truncate leading-tight">{leg.to}</p>
                          </div>
                          <button
                            onClick={toggleThisLeg}
                            className={`flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                              thisLegOn ? "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100" : "text-zinc-300 hover:text-zinc-500"
                            }`}
                          >
                            {thisLegOn ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Transport arcs (flight / train) ── */}
            {hasTransportArcs && (
              <div>
                <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 border-t border-zinc-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Transport routes</p>
                  <button
                    onClick={() => { setShowTransportLegs(v => { if (!v) setTransportLegVisible(null); return !v; }); }}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${showTransportLegs ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-500"}`}
                  >
                    {showTransportLegs ? "All on" : "All off"}
                  </button>
                </div>
                <div className="divide-y divide-zinc-50">
                  {transportLegs.map((leg, i) => {
                    if (!leg.fromLat || !leg.toLat) return null;
                    const tm = leg.transportMode;
                    const icon = tm === "flight" ? "✈️" : tm === "train" ? "🚂" : "🚌";
                    const color = leg.color || LEG_COLORS[i % LEG_COLORS.length];
                    const thisOn = transportLegVisible === null || transportLegVisible.has(i);
                    const distKm = gcDist(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng);

                    const toggleThisLeg = () => {
                      setTransportLegVisible((prev) => {
                        const total = transportLegs.filter(l => l.fromLat && l.toLat).length;
                        const current = prev === null
                          ? new Set(Array.from({ length: total }, (_, k) => k))
                          : new Set(prev);
                        if (current.has(i)) current.delete(i);
                        else current.add(i);
                        return current.size === total ? null : current;
                      });
                    };

                    return (
                      <div key={i} className={`px-4 py-3 transition-colors ${!thisOn || !showTransportLegs ? "opacity-40" : ""}`}>
                        <div className="flex items-center gap-3">
                          {/* Icon + color dot */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 border-white shadow-sm"
                              style={{ background: color + "22", borderColor: color }}>
                              {icon}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            {leg.title && <p className="text-[11px] font-bold text-zinc-700 truncate">{leg.title}</p>}
                            <p className="text-[12px] font-semibold text-zinc-800 truncate leading-tight">
                              {leg.fromStation || "—"} → {leg.toStation || "—"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span className="text-[11px] font-semibold" style={{ color }}>{distKm} km</span>
                              {leg.date && <span className="text-[10px] text-zinc-400">{new Date(leg.date).toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>}
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: color + "18", color }}>
                                {tm === "flight" ? "arc" : "route"}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={toggleThisLeg}
                            className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                              thisOn ? "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100" : "text-zinc-300 hover:text-zinc-500"
                            }`}
                          >
                            {thisOn ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100">
            <p className="text-[10px] text-zinc-400">
              Click any arc or route on the map for details.
            </p>
          </div>
        </div>
      )}

      {/* ── Transport detail card (appears on arc click) ── */}
      {selectedTransport && (
        <div
          className="absolute z-20 bg-white rounded-2xl shadow-2xl border border-zinc-100 w-[260px] overflow-hidden"
          style={{
            left: Math.min(selectedTransport.screenX + 12, window.innerWidth - 280),
            top: Math.min(selectedTransport.screenY - 20, (mapRef.current?.offsetHeight || 600) - 280),
          }}
        >
          {/* Color bar */}
          <div className="h-1 w-full" style={{ background: selectedTransport.leg.color || "#ef4444" }} />

          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {selectedTransport.leg.transportMode === "flight" ? "✈️" :
                   selectedTransport.leg.transportMode === "train" ? "🚂" : "🚌"}
                </span>
                <div>
                  <p className="text-xs font-bold text-zinc-800 leading-tight">
                    {selectedTransport.leg.title || selectedTransport.leg.transportMode}
                  </p>
                  <p className="text-[10px] text-zinc-400 capitalize">{selectedTransport.leg.transportMode}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTransport(null)}
                className="text-zinc-300 hover:text-zinc-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* From → To */}
            <div className="flex items-start gap-2 mb-3">
              <div className="flex flex-col items-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full border-2" style={{ borderColor: selectedTransport.leg.color || "#10b981" }} />
                <div className="w-px h-6 my-0.5" style={{ background: (selectedTransport.leg.color || "#10b981") + "60" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: selectedTransport.leg.color || "#10b981" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-2">
                  <p className="text-sm font-semibold text-zinc-800 leading-tight truncate">
                    {selectedTransport.leg.fromStation || "—"}
                  </p>
                  {selectedTransport.leg.date && (
                    <p className="text-[11px] text-zinc-400">
                      {new Date(selectedTransport.leg.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}
                      {selectedTransport.leg.time ? ` · ${selectedTransport.leg.time}` : ""}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 leading-tight truncate">
                    {selectedTransport.leg.toStation || "—"}
                  </p>
                  {selectedTransport.leg.endDate && (
                    <p className="text-[11px] text-zinc-400">
                      {new Date(selectedTransport.leg.endDate).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}
                      {selectedTransport.leg.endTime ? ` · ${selectedTransport.leg.endTime}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: (selectedTransport.leg.color || "#10b981") + "18", color: selectedTransport.leg.color || "#10b981" }}>
                {selectedTransport.leg.fromLat && selectedTransport.leg.toLat
                  ? `~${gcDist(selectedTransport.leg.fromLat, selectedTransport.leg.fromLng, selectedTransport.leg.toLat, selectedTransport.leg.toLng)} km`
                  : "—"}
              </span>
              {selectedTransport.leg.bookingRef && (
                <span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">
                  #{selectedTransport.leg.bookingRef.slice(0, 10)}
                </span>
              )}
              {selectedTransport.leg.transportMode === "flight" && (
                <span className="text-[10px] text-zinc-400 ml-auto">Great-circle arc</span>
              )}
            </div>

            {selectedTransport.leg.notes && (
              <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed line-clamp-3">
                {selectedTransport.leg.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date Modal ────────────────────────────────────────────────
function DateModal({ trip, onClose, onSave }) {
  const TODAY = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(trip.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "");
  const [endDate, setEndDate] = useState(trip.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (startDate && endDate && endDate < startDate) { setError("End date cannot be before start date."); return; }
    setSaving(true);
    try { await onSave({ startDate: startDate || null, endDate: endDate || null }); onClose(); }
    catch { setError("Failed to save dates. Try again."); }
    finally { setSaving(false); }
  };

  const daysBetween = startDate && endDate
    ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-900">Edit trip dates</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Start Date</label>
            <input type="date" value={startDate} min={TODAY}
              onChange={(e) => { setStartDate(e.target.value); setError(""); if (endDate && endDate < e.target.value) setEndDate(""); }}
              className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2.5 text-zinc-800 text-sm transition-colors bg-transparent" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">End Date</label>
            <input type="date" value={endDate} min={startDate || TODAY} disabled={!startDate}
              onChange={(e) => { setEndDate(e.target.value); setError(""); }}
              className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2.5 text-zinc-800 text-sm transition-colors bg-transparent disabled:opacity-40 disabled:cursor-not-allowed" />
            {!startDate && <p className="text-xs text-zinc-400 mt-1">Select a start date first</p>}
          </div>
        </div>
        {daysBetween && (
          <div className="mt-4 bg-rose-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-rose-600 font-medium">Duration</span>
            <span className="text-xs font-bold text-rose-600">{daysBetween} days</span>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-full transition-all flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : "Save dates"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
const TABS = ["Explore", "Plan", "Notes", "Files"];

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("Explore");
  const [showInvite, setShowInvite] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [mobileMapView, setMobileMapView] = useState(false); // mobile: toggle list vs map on Plan tab
  const [itineraryItems, setItineraryItems] = useState([]);

  const fetchTrip = () => {
    setLoading(true);
    api.get(`/trips/${id}`)
      .then((res) => {
        setTrip(res.data.trip);
        const saved = res.data.trip.itinerary || [];
        const normalized = saved.map((item) => ({
          ...item,
          _id: item.clientId || item._id || Date.now().toString() + Math.random(),
        }));
        setItineraryItems(normalized.length > 0 ? normalized : (
          res.data.trip.destination?.name
            ? [{ _id: "default-" + Date.now(), clientId: "default-" + Date.now(), type: "destination", title: res.data.trip.destination.name, date: "", endDate: "", isSubDest: false }]
            : []
        ));
      })
      .catch((err) => {
        if (err.response?.status === 403) setError("You don't have access to this trip.");
        else if (err.response?.status === 404) setError("Trip not found.");
        else setError("Failed to load trip.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTrip(); }, [id]);

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setMobileMapView(false); // always land on the list/panel first on mobile
    if (tab === "Plan") setMapMounted(true);
  };

  const handleSaveDates = async (dates) => {
    await api.put(`/trips/${id}`, dates);
    setTrip((prev) => ({ ...prev, ...dates }));
  };

  const addPlaceToItinerary = (newItem) => {
    const newItems = [...itineraryItems, newItem];
    setItineraryItems(newItems);
    setActiveTab("Plan");
    setMapMounted(true);
    api.put(`/trips/${id}/itinerary`, { itinerary: newItems }).catch(console.error);
  };

  if (loading) return <TripSkeleton />;
  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">😕</div>
        <p className="text-zinc-600 font-medium">{error}</p>
        <Link to="/dashboard" className="text-sm text-rose-500 hover:text-rose-600">← Back to Dashboard</Link>
      </div>
    );
  }

  const myMembership = trip.members?.find(
    (m) => m.user?._id?.toString() === user?._id?.toString() || m.user?.toString() === user?._id?.toString()
  );
  const isMember = !!myMembership;
  const myRole = myMembership?.role;
  const canEdit = myRole === "owner" || myRole === "editor";

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;
  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  // Build destination markers (for road routes)
  const destMarkers = itineraryItems.filter((it) => it.type === "destination" && it.lat && it.lng);

  // Build transport legs (for arcs): transport items with fromLat/toLat coords
  const transportLegs = itineraryItems
    .filter((it) => it.type === "transport" && it.fromLat && it.fromLng && it.toLat && it.toLng)
    .map((it, i) => ({
      ...it,
      color: LEG_COLORS[(destMarkers.length + i) % LEG_COLORS.length],
    }));

  return (
    <div className="h-[100dvh] bg-white flex flex-col overflow-hidden">
      {showInvite && <InviteModal tripId={id} onClose={() => setShowInvite(false)} onInvited={fetchTrip} />}
      {showDateModal && canEdit && <DateModal trip={trip} onClose={() => setShowDateModal(false)} onSave={handleSaveDates} />}

      {/* Top bar */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-zinc-100 flex-shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/dashboard")} className="text-zinc-400 hover:text-zinc-600 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-sm font-semibold text-zinc-800 truncate">{trip.name}</h1>
          {trip.startDate && trip.endDate ? (
            <button
              onClick={() => canEdit && setShowDateModal(true)}
              className={`flex items-center gap-1.5 bg-zinc-100 text-zinc-500 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors ${canEdit ? "hover:bg-zinc-200 cursor-pointer" : "cursor-default"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
              {canEdit && <svg className="w-3 h-3 text-zinc-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
            </button>
          ) : canEdit ? (
            <button onClick={() => setShowDateModal(true)}
              className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Add dates
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-zinc-400 hidden sm:flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Saved
          </span>
          <div className="flex -space-x-1">
            {trip.members?.slice(0, 4).map((m, i) => (
              <div key={i} title={m.user?.name} className="w-7 h-7 rounded-full border-2 border-white bg-rose-200 flex items-center justify-center overflow-hidden" style={{ zIndex: trip.members.length - i }}>
                {m.user?.avatar ? <img src={m.user.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-xs font-bold text-rose-600">{initials(m.user?.name)}</span>}
              </div>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-4 py-2 rounded-full transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              Invite
            </button>
          )}
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex items-center px-3 sm:px-6 border-b border-zinc-100 flex-shrink-0">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => handleTabClick(tab)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab ? "text-rose-500" : "text-zinc-400 hover:text-zinc-600"}`}>
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full" />}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "Explore" && (
          <ExploreTab trip={trip} isMember={isMember} onAddToItinerary={addPlaceToItinerary} />
        )}

        {activeTab !== "Explore" && (
          <>
            {/* Left panel */}
            <div className={`w-full md:w-[420px] flex-shrink-0 border-r border-zinc-100 overflow-hidden ${activeTab === "Plan" && mobileMapView ? "hidden md:block" : "block"}`}>
              {activeTab === "Plan" && (
                <PlanTab trip={trip} canEdit={canEdit} isMember={isMember}
                  itineraryItems={itineraryItems} setItineraryItems={setItineraryItems} />
              )}
              {activeTab === "Notes" && <NotesTab trip={trip} canEdit={canEdit} isMember={isMember} />}
              {activeTab === "Files" && <FilesTab trip={trip} canEdit={canEdit} isMember={isMember} />}
            </div>

            {/* Right panel — trip map */}
            <div className={`flex-1 relative overflow-hidden ${activeTab === "Plan" && mobileMapView ? "block" : "hidden md:block"}`}>
              <div className="absolute inset-0" style={{ display: mapMounted && isMember ? "block" : "none" }}>
                {mapMounted && isMember && (
                  <TripMap
                    destination={trip.destination}
                    markers={destMarkers}
                    transportLegs={transportLegs}
                  />
                )}
              </div>

              {/* Placeholder for non-Plan tabs */}
              {activeTab !== "Plan" || !isMember ? (
                <div className="absolute inset-0 bg-zinc-50 flex flex-col items-center justify-center gap-3">
                  <div className="absolute inset-0 opacity-[0.06]"
                    style={{ backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                  <div className="relative z-10 text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </div>
                    <p className="text-zinc-500 font-medium text-sm">
                      {activeTab === "Plan" && !isMember ? "Map is private" : "Switch to Plan to view map"}
                    </p>
                    {trip.destination?.name && (
                      <p className="text-zinc-400 text-xs mt-1">📍 {trip.destination.fullLabel || trip.destination.name}</p>
                    )}
                  </div>
                  {isMember && trip.destination?.name && (
                    <div className="absolute bottom-6 left-4 right-4 flex items-center gap-3">
                      <div className="bg-white rounded-xl shadow-md px-4 py-2.5 flex items-center gap-2 flex-1">
                        <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-zinc-700">{trip.destination.name}</span>
                        <svg className="w-4 h-4 text-zinc-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      <button onClick={() => handleTabClick("Plan")}
                        className="bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md px-4 py-2.5 flex items-center gap-1.5 text-sm text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        Open Map
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Mobile-only: toggle between itinerary list and map on the Plan tab */}
      {activeTab === "Plan" && isMember && (
        <button
          onClick={() => { setMobileMapView((v) => !v); setMapMounted(true); }}
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