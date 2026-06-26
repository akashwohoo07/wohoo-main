import { useState, useEffect, useRef } from "react";
import api from "../../api/axios";
import { StarRow } from "./FormFields.jsx";

const SEARCHABLE_TYPES = {
  hotel:      { kind: "stays",      icon: "🏨", label: "Hotels & Stays" },
  restaurant: { kind: "eats",       icon: "🍽️", label: "Restaurants & Cafes" },
  activity:   { kind: "activities", icon: "🎯", label: "Activities" },
  place:      { kind: "sights",     icon: "🏛️", label: "Sights & Museums" },
};

const PRICE_LABELS = ["", "₹", "₹₹", "₹₹₹", "₹₹₹₹"];

export default function PlaceSearchDrawer({ type, tripDestination, onSelect, onClose }) {
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
    if (coords?.lat && meta) doSearch("");
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
      lat: place.lat, lng: place.lng, placeId: place.id,
      notes: [
        place.description || "",
        place.hours    ? `🕐 ${place.hours.split("\n")[0]}` : "",
        place.website  ? `🌐 ${place.website}` : "",
        place.phone    ? `📞 ${place.phone}`   : "",
        place.rating   ? `⭐ ${place.rating} (${place.reviewCount || 0} reviews)` : "",
      ].filter(Boolean).join("\n"),
      photo: place.photo || null,
      rating: place.rating || null,
      reviewCount: place.reviewCount || null,
      isOpen: place.isOpen,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-0 sm:px-4"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-zinc-100 flex-shrink-0">
          <span className="text-xl">{meta?.icon}</span>
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
            <input ref={inputRef} value={query} onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={`Search ${meta?.label?.toLowerCase() || "places"}...`}
              className="flex-1 text-sm outline-none bg-transparent text-zinc-700 placeholder-zinc-400" />
            {loading && <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin flex-shrink-0"/>}
          </div>
          {!coords?.lat && (
            <p className="text-[11px] text-zinc-400 mt-1.5 text-center">Add a destination to see nearby results</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="divide-y divide-zinc-50">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-14 h-14 bg-zinc-100 rounded-xl flex-shrink-0"/>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-zinc-100 rounded w-3/4"/>
                    <div className="h-3 bg-zinc-100 rounded w-1/2"/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
              <span className="text-3xl">🔍</span>
              <p className="text-sm text-zinc-500">No results found</p>
              <p className="text-xs text-zinc-400">Try a different search term</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="divide-y divide-zinc-50">
              {results.map((place) => (
                <button key={place.id} onClick={() => handlePick(place)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 flex items-center justify-center">
                    {place.photo
                      ? <img src={place.photo} alt={place.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display="none"; }}/>
                      : <span className="text-2xl opacity-30">{meta?.icon}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate leading-tight">{place.name}</p>
                    {place.address && <p className="text-[11px] text-zinc-400 truncate mt-0.5">📍 {place.address}</p>}
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