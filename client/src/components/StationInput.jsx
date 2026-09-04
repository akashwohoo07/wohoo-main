import { useState, useEffect, useRef } from "react";
import { Loader2, TrainFront } from "lucide-react";
import api from "../api/axios";

// Railway station autocomplete backed by OpenStreetMap via
// /api/transport/stations. Selecting a station returns its coordinates so the
// caller can draw the train's track between the two stations on the map.
export default function StationInput({ value, onChange, onSelect, placeholder, className }) {
  const [q, setQ] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const debounce = useRef(null);

  useEffect(() => { setQ(value || ""); }, [value]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const search = (text) => {
    clearTimeout(debounce.current);
    if (text.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/transport/stations?q=${encodeURIComponent(text.trim())}`);
        setResults(data.stations || []);
        setOpen(true);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  const handleChange = (e) => { const v = e.target.value; setQ(v); onChange?.(v); search(v); };
  const pick = (s) => {
    setQ(s.label); setOpen(false); setResults([]);
    onSelect?.(s);
  };

  return (
    <div className="relative" ref={ref}>
      <input
        value={q}
        onChange={handleChange}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300 absolute right-1 top-2" />}
      {open && results.length > 0 && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-zinc-100 max-h-56 overflow-y-auto">
          {results.map((s, i) => (
            <button
              key={`${s.name}-${s.lat}-${i}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 text-left"
            >
              <TrainFront className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm text-zinc-700 truncate">{s.name}</span>
                <span className="block text-xs text-zinc-400 truncate">
                  {[s.city, s.state, s.country].filter(Boolean).join(", ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
