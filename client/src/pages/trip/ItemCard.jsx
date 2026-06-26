import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TYPE_META, TRANSPORT_MODES, fmtDateShort, fmtTime, getCurrencySymbol, getCountryCode } from "./constants.js";
import { useNominatim } from "./hooks.js";
import ItemModal from "./ItemModal.jsx";

// ── DestinationCard — inline editable heading ─────────────────
export function DestinationCard({ item, canEdit, hovered, isDragging, attributes, listeners, dateChip, displayTitle, onDelete, onUpdate, bias }) {
  const [inlineEdit, setInlineEdit] = useState(!item.title);
  const [titleVal, setTitleVal]     = useState(item.title || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef(null);

  const { results: destResults, searching: destSearching } = useNominatim(
    inlineEdit && dropdownOpen ? titleVal : "", bias
  );

  const commitTitle = () => {
    setInlineEdit(false);
    const trimmed = titleVal.trim();
    if (!trimmed || trimmed === item.title) return;
    onUpdate({ ...item, title: trimmed });
  };

  const selectDest = (r) => {
    setTitleVal(r.primary);
    setInlineEdit(false);
    setDropdownOpen(false);
    onUpdate({ ...item, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub });
  };

  useEffect(() => { if (inlineEdit && inputRef.current) inputRef.current.focus(); }, [inlineEdit]);
  useEffect(() => { setTitleVal(item.title || ""); }, [item.title]);

  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded-xl transition-colors ${hovered && canEdit ? "bg-zinc-50" : ""}`}>
      {canEdit && (
        <div className={`flex items-center gap-0.5 mt-2 flex-shrink-0 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
          <button onClick={onDelete} className="w-5 h-5 flex items-center justify-center text-zinc-300 hover:text-red-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button className="w-5 h-5 flex items-center justify-center text-zinc-300 hover:text-zinc-500 touch-none"
            {...attributes} {...listeners} style={{ cursor: isDragging ? "grabbing" : "grab" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>

          {inlineEdit && canEdit ? (
            <div className="flex-1 relative">
              <input ref={inputRef} value={titleVal}
                onChange={(e) => { setTitleVal(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(commitTitle, 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { setTitleVal(item.title || ""); setInlineEdit(false); setDropdownOpen(false); }
                }}
                placeholder="Search destination..."
                className="text-2xl font-bold text-zinc-900 outline-none bg-transparent w-full placeholder-zinc-300"
                style={{ caretColor: "#ef4444" }} autoComplete="off" />
              {dropdownOpen && titleVal.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-xl shadow-xl z-30 overflow-hidden max-h-48 overflow-y-auto">
                  {destSearching && (
                    <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
                      <div className="w-3 h-3 border border-rose-300 border-t-rose-500 rounded-full animate-spin" />Searching...
                    </div>
                  )}
                  {!destSearching && destResults.length === 0 && titleVal.length >= 2 && (
                    <div className="px-4 py-3 text-xs text-zinc-400">No results found</div>
                  )}
                  {destResults.map((r, i) => (
                    <button key={i} onMouseDown={(e) => { e.preventDefault(); selectDest(r); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors text-left">
                      <div className="w-5 h-5 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{r.primary}</p>
                        {r.sub && <p className="text-xs text-zinc-400">{r.sub}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span onClick={() => canEdit && setInlineEdit(true)}
              className={`text-2xl font-bold leading-tight ${displayTitle ? "text-zinc-900" : "text-zinc-300 italic font-normal text-lg"} ${canEdit ? "cursor-text" : ""}`}>
              {displayTitle || "Destination"}
            </span>
          )}
        </div>

        {(item.region || dateChip) && !inlineEdit && (
          <div className="flex items-center gap-2 mt-0.5 ml-5 flex-wrap">
            {item.region && <span className="text-[11px] text-zinc-400">📍 {item.region}</span>}
            {dateChip && <span className="text-[11px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">{dateChip}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ItemCard — sortable row for all non-destination items ─────
export function ItemCard({ item, index, canEdit, tripStartDate, tripEndDate, tripDestination, onUpdate, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item._id || String(index) });

  const meta = TYPE_META[item.type] || TYPE_META.other;
  const isDestination = item.type === "destination";
  const tm = TRANSPORT_MODES.find((m) => m.id === item.transportMode);
  const bias = tripDestination?.coordinates?.lat
    ? { lat: tripDestination.coordinates.lat, lng: tripDestination.coordinates.lng, countryCode: getCountryCode(tripDestination.country) }
    : null;

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const dateChip = (() => {
    const p = [];
    if (item.date)    p.push(fmtDateShort(item.date));
    if (item.time)    p.push(fmtTime(item.time));
    if (item.endDate && item.endDate !== item.date) p.push("→ " + fmtDateShort(item.endDate));
    if (item.endTime && item.endTime !== item.time) p.push(fmtTime(item.endTime));
    return p.join(" ");
  })();

  const priceChip = item.price
    ? `${getCurrencySymbol(item.currency || "INR")}${Number(item.price).toLocaleString("en-IN")}` : null;

  const displayTitle = (() => {
    if (item.type === "transport" && item.fromStation && item.toStation)
      return `${item.fromStation} → ${item.toStation}`;
    return item.title || null;
  })();

  const hasTransportRoute = item.type === "transport" && item.fromLat && item.fromLng && item.toLat && item.toLng;

  return (
    <>
      <div ref={setNodeRef} style={style} className={`group/card relative ${isDestination ? "" : "ml-3"}`}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

        {isDestination ? (
          <DestinationCard item={item} canEdit={canEdit} hovered={hovered}
            isDragging={isDragging} attributes={attributes} listeners={listeners}
            dateChip={dateChip} displayTitle={displayTitle} bias={bias}
            onDelete={() => onDelete(index)}
            onUpdate={(updated) => onUpdate(index, updated, true)} />
        ) : (
          <div className={`flex items-start gap-2 px-2 py-2 rounded-xl transition-colors cursor-pointer ${hovered && canEdit ? "bg-zinc-50" : ""}`}
            onClick={() => canEdit && setEditing(true)}>

            {canEdit && (
              <div className={`flex items-center gap-0.5 flex-shrink-0 mt-1 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
                <button onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                  className="w-4 h-4 flex items-center justify-center text-zinc-300 hover:text-red-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <button onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 flex items-center justify-center text-zinc-300 hover:text-zinc-500 touch-none"
                  {...attributes} {...listeners} style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              </div>
            )}

            <span className={`w-6 h-6 flex items-center justify-center rounded-md border text-xs flex-shrink-0 mt-1 ${meta.color}`}>
              {item.type === "transport" && tm ? tm.icon : meta.icon}
            </span>

            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-tight truncate ${displayTitle ? "font-medium text-zinc-800" : "text-zinc-400 italic"}`}>
                {displayTitle || meta.label}
              </p>
              {item.type === "transport" && item.title && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight">{item.title}</p>
              )}
              {item.type !== "transport" && item.region && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight">📍 {item.region}</p>
              )}
              {item.rating && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-amber-400 text-[10px]">★</span>
                  <span className="text-[10px] font-semibold text-zinc-600">{item.rating}</span>
                  {item.reviewCount && <span className="text-[10px] text-zinc-400">({item.reviewCount >= 1000 ? (item.reviewCount/1000).toFixed(1)+"k" : item.reviewCount})</span>}
                  {item.isOpen === true  && <span className="text-[10px] text-green-600 font-semibold ml-1">● Open</span>}
                  {item.isOpen === false && <span className="text-[10px] text-red-500 font-semibold ml-1">● Closed</span>}
                </div>
              )}
              {item.type === "note" && !item.title && item.notes && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight">{item.notes}</p>
              )}
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {dateChip && <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">{dateChip}</span>}
                {priceChip && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">{priceChip}</span>}
                {item.bookingRef && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">#{item.bookingRef.slice(0, 8)}</span>}
                {hasTransportRoute && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    On map
                  </span>
                )}
              </div>
            </div>

            {item.photo && ["hotel","restaurant","activity","place","shopping"].includes(item.type) && (
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100">
                <img src={item.photo} alt={item.title} className="w-full h-full object-cover"
                  onError={(e) => { e.target.parentElement.style.display = "none"; }} />
              </div>
            )}
          </div>
        )}
      </div>

      {editing && item.type !== "destination" && (
        <ItemModal item={item} tripStartDate={tripStartDate} tripEndDate={tripEndDate}
          tripDestination={tripDestination}
          onClose={() => setEditing(false)}
          onSave={(updated) => { onUpdate(index, updated, true); setEditing(false); }} />
      )}
    </>
  );
}