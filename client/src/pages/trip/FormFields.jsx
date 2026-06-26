import { useState, useEffect, useRef } from "react";
import { useNominatim, useHotelSearch } from "./hooks.js";
import { CURRENCIES } from "./constants.js";

// ── LocationField ──────────────────────────────────────────────
export function LocationField({ label, value, onChange, onSelect, placeholder, bias }) {
  const { results, searching } = useNominatim(value, bias);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {label && <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">{label}</label>}
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search location..."}
        className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300 transition-colors"
      />
      {open && value.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 overflow-hidden max-h-44 overflow-y-auto">
          {searching && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400">
              <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />
              Searching...
            </div>
          )}
          {!searching && results.length === 0 && <div className="px-3 py-2.5 text-xs text-zinc-400">No results found</div>}
          {results.map((r, i) => (
            <button key={i}
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onSelect(r); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors text-left">
              <div className="w-5 h-5 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-800 truncate">{r.primary}</p>
                {r.sub && <p className="text-[11px] text-zinc-400 truncate">{r.sub}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HotelSearchField ───────────────────────────────────────────
export function HotelSearchField({ value, onChange, onSelect, bias }) {
  const { results, searching } = useHotelSearch(value, bias);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const typeBadge = (t) => {
    const map = { hostel: { label: "Hostel", color: "bg-violet-50 text-violet-600" }, motel: { label: "Motel", color: "bg-zinc-100 text-zinc-500" }, resort: { label: "Resort", color: "bg-emerald-50 text-emerald-600" }, guest_house: { label: "Guesthouse", color: "bg-amber-50 text-amber-600" }, apartment: { label: "Apartment", color: "bg-blue-50 text-blue-600" } };
    return map[t] || { label: "Hotel", color: "bg-rose-50 text-rose-500" };
  };

  return (
    <div className="relative" ref={ref}>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Search hotel / property</label>
      <div className="flex items-center gap-2 border-b border-zinc-200 focus-within:border-rose-400 transition-colors pb-1">
        <svg className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder="e.g. The Oberoi Delhi, Zostel Manali..." autoComplete="off"
          className="flex-1 text-sm outline-none py-1 text-zinc-700 bg-transparent placeholder-zinc-300" />
        {searching && <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin flex-shrink-0" />}
      </div>

      {open && value.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[280px] overflow-y-auto">
          {searching && results.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
              <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />
              Searching near your destination...
            </div>
          )}
          {!searching && results.length === 0 && <div className="px-4 py-3 text-xs text-zinc-400">No properties found — try adding the city name</div>}
          {results.map((r, i) => {
            const badge = typeBadge(r.type);
            return (
              <button key={i} onMouseDown={(e) => { e.preventDefault(); setOpen(false); onSelect(r); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 transition-colors text-left border-b border-zinc-50 last:border-0">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 flex items-center justify-center">
                  {r.photo ? <img src={r.photo} alt={r.name} className="w-full h-full object-cover" /> : <span className="text-xl">🏨</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate leading-tight">{r.name}</p>
                  {r.region && <p className="text-[11px] text-zinc-400 truncate mt-0.5">📍 {r.region}</p>}
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${badge.color}`}>{badge.label}</span>
                </div>
              </button>
            );
          })}
          {!searching && value.length >= 2 && (
            <button onMouseDown={(e) => { e.preventDefault(); setOpen(false); onSelect({ name: value, region: "", lat: null, lng: null, placeId: "" }); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 transition-colors text-left border-t border-zinc-100">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0"><span className="text-xl">✏️</span></div>
              <div>
                <p className="text-sm font-medium text-zinc-700">Add "{value}" manually</p>
                <p className="text-[11px] text-zinc-400">Without map pin or photo</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── PriceField ─────────────────────────────────────────────────
export function PriceField({ price, currency, onPriceChange, onCurrencyChange }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Price (optional)</label>
      <div className="flex items-center gap-2">
        <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}
          className="text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-600 bg-transparent">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
        <input type="number" min="0" value={price} onChange={(e) => onPriceChange(e.target.value)} placeholder="Amount"
          className="flex-1 text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
      </div>
    </div>
  );
}

// ── DTPair ─────────────────────────────────────────────────────
export function DTPair({ label, date, time, onDate, onTime, minDate, maxDate, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">{label}</label>
        <input type="date" value={date} min={minDate} max={maxDate} disabled={disabled}
          onChange={(e) => onDate(e.target.value)}
          className="w-full text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent disabled:opacity-40" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Time (opt.)</label>
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} disabled={disabled}
          className="w-full text-xs border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent disabled:opacity-40" />
      </div>
    </div>
  );
}

// ── NotesField ─────────────────────────────────────────────────
export function NotesField({ value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Notes (optional)</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent resize-none placeholder-zinc-300" />
    </div>
  );
}

// ── StarRow ────────────────────────────────────────────────────
export function StarRow({ rating, count }) {
  if (!rating) return null;
  const r = parseFloat(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} className={`w-2.5 h-2.5 ${i < Math.round(r) ? "text-amber-400" : "text-zinc-200"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        ))}
      </div>
      <span className="text-[10px] font-bold text-zinc-600">{r.toFixed(1)}</span>
      {count && <span className="text-[10px] text-zinc-400">({count >= 1000 ? (count/1000).toFixed(1)+"k" : count})</span>}
    </div>
  );
}