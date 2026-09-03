import { useState, useEffect, useRef } from "react";
import { Loader2, Plane } from "lucide-react";
import api from "../api/axios";

// Airport autocomplete backed by the bundled OpenFlights dataset
// (/api/transport/airports). Selecting an airport returns its coords so the
// caller can draw the flight path on the map.
export default function AirportInput({ value, onChange, onSelect, placeholder, className }) {
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
        const { data } = await api.get(`/transport/airports?q=${encodeURIComponent(text.trim())}`);
        setResults(data.airports || []);
        setOpen(true);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 200);
  };

  const handleChange = (e) => { const v = e.target.value; setQ(v); onChange?.(v); search(v); };
  const pick = (a) => {
    const label = `${a.city || a.name} (${a.iata})`;
    setQ(label); setOpen(false); setResults([]);
    onSelect?.({ ...a, label });
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
          {results.map((a) => (
            <button
              key={`${a.iata}-${a.name}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(a); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 text-left"
            >
              <span className="text-xs font-bold text-sky-600 w-9 flex-shrink-0 inline-flex items-center gap-0.5"><Plane className="w-3 h-3" />{a.iata}</span>
              <span className="min-w-0">
                <span className="block text-sm text-zinc-700 truncate">{a.city || a.name}</span>
                <span className="block text-xs text-zinc-400 truncate">{a.name}{a.country ? ` · ${a.country}` : ""}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
