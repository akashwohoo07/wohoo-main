import { useState } from "react";
import { MapPin, BedDouble, Pencil, Plane, TrainFront } from "lucide-react";
import { TYPE_META, TRANSPORT_MODES, makeCid, getCountryCode } from "./constants.js";
import { LocationField, HotelSearchField, PriceField, DTPair, NotesField } from "./FormFields.jsx";
import { FlightSearchPanel, TrainSearchPanel } from "./TransportSearch.jsx";

export default function ItemModal({ item, tripStartDate, tripEndDate, tripDestination, onSave, onClose }) {
  const [form, setForm] = useState({ ...item });
  const [transportSearch, setTransportSearch] = useState("manual"); // "manual" | "flight" | "train"

  const minDate = tripStartDate ? new Date(tripStartDate).toISOString().split("T")[0] : "";
  const maxDate = tripEndDate   ? new Date(tripEndDate).toISOString().split("T")[0]   : "";
  const meta = TYPE_META[item.type] || TYPE_META.other;
  const set  = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const bias = tripDestination?.coordinates?.lat
    ? { lat: tripDestination.coordinates.lat, lng: tripDestination.coordinates.lng, countryCode: getCountryCode(tripDestination.country) }
    : null;

  const canSave = item.type === "note"
    ? (form.notes?.trim() || form.title?.trim())
    : form.title?.trim() || (item.type === "transport" && (form.fromStation?.trim() || form.toStation?.trim()));

  const handleSave = () => {
    if (!canSave) return;
    const title = form.title?.trim()
      || (item.type === "transport" && form.fromStation && form.toStation ? `${form.fromStation} → ${form.toStation}` : "")
      || form.notes?.slice(0, 40)
      || "Untitled";
    onSave({ ...form, title, clientId: form.clientId || form._id || makeCid() });
  };

  // Called when flight/train search fills fields
  const handleSearchFill = (data) => {
    setForm((f) => ({ ...f, ...data }));
    setTransportSearch("manual");
  };

  const tm = TRANSPORT_MODES.find((m) => m.id === form.transportMode);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
          {(() => {
            const HeadIcon = item.type === "transport" && tm ? tm.icon : meta.icon;
            return (
              <span className={`w-9 h-9 flex items-center justify-center rounded-xl border flex-shrink-0 ${meta.color}`}>
                <HeadIcon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </span>
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-800">{meta.label}</p>
            <p className="text-[11px] text-zinc-400">{meta.desc}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ── DESTINATION ── */}
          {item.type === "destination" && <>
            <LocationField label="Destination" value={form.title} onChange={(v) => set("title", v)}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub }))}
              placeholder="Search city, town, place..." />
            {form.lat && <p className="text-[11px] text-zinc-400 -mt-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
            <DTPair label="Arrival" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Departure" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Things to remember about this place..." />
          </>}

          {/* ── HOTEL ── */}
          {item.type === "hotel" && <>
            <HotelSearchField value={form.title} onChange={(v) => set("title", v)} bias={bias}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.name, region: r.region || f.region, lat: r.lat ?? f.lat, lng: r.lng ?? f.lng, placeId: r.placeId || f.placeId }))} />
            {form.title && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <BedDouble className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 truncate">{form.title}</p>
                  {form.region && <p className="text-[11px] text-zinc-500 truncate inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
                </div>
                <button onClick={() => setForm((f) => ({ ...f, title: "", region: "", lat: null, lng: null, placeId: "" }))}
                  className="text-zinc-300 hover:text-zinc-500 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <DTPair label="Check-in" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Check-out" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Booking reference</label>
              <input value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="Confirmation / booking ID"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Room type, amenities, contact info..." />
          </>}

          {/* ── RESTAURANT ── */}
          {item.type === "restaurant" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Restaurant name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Bukhara, local dhaba..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Area / Address" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Search area or address..." />
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Cuisine, reservation, must-try dishes..." />
          </>}

          {/* ── ACTIVITY ── */}
          {item.type === "activity" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Activity name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Paragliding, Temple visit, Trek..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Location" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Where does it happen?" />
            <DTPair label="Start" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="End" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="What to carry, booking link, operator details..." />
          </>}

          {/* ── TRANSPORT ── */}
          {item.type === "transport" && <>
            {/* Mode picker */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Mode of transport</label>
              <div className="flex flex-wrap gap-1.5">
                {TRANSPORT_MODES.map((m) => {
                  const ModeIcon = m.icon;
                  return (
                  <button key={m.id} type="button"
                    onClick={() => { set("transportMode", m.id); if (m.id !== "flight" && m.id !== "train") setTransportSearch("manual"); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      form.transportMode === m.id ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                    }`}>
                    <ModeIcon className="w-3.5 h-3.5" /> {m.label}
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Search tabs — only for flight / train */}
            {(form.transportMode === "flight" || form.transportMode === "train") && (
              <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
                <button onClick={() => setTransportSearch("manual")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all ${transportSearch === "manual" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500"}`}>
                  <Pencil className="w-3.5 h-3.5" /> Manual
                </button>
                {form.transportMode === "flight" && (
                  <button onClick={() => setTransportSearch("flight")}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all ${transportSearch === "flight" ? "bg-white text-sky-700 shadow-sm" : "text-zinc-500"}`}>
                    <Plane className="w-3.5 h-3.5" /> By flight no.
                  </button>
                )}
                {form.transportMode === "train" && (
                  <button onClick={() => setTransportSearch("train")}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all ${transportSearch === "train" ? "bg-white text-amber-700 shadow-sm" : "text-zinc-500"}`}>
                    <TrainFront className="w-3.5 h-3.5" /> Search train
                  </button>
                )}
              </div>
            )}

            {/* Flight search panel */}
            {transportSearch === "flight" && form.transportMode === "flight" && (
              <FlightSearchPanel onFill={handleSearchFill} initialFlightNum={form.title} initialDate={form.date} />
            )}

            {/* Train search panel */}
            {transportSearch === "train" && form.transportMode === "train" && (
              <TrainSearchPanel onFill={handleSearchFill} initialQuery={form.title || form.bookingRef} initialDate={form.date} />
            )}

            {/* Pre-fill summary badge — shown when search has populated the form */}
            {transportSearch !== "manual" && (form.fromStation || form.toStation) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                {form.transportMode === "flight" ? <Plane className="w-4 h-4 text-emerald-600" /> : <TrainFront className="w-4 h-4 text-emerald-600" />}
                <div className="flex-1 min-w-0">
                  {form.title && <p className="text-xs font-semibold text-zinc-800 truncate">{form.title}</p>}
                  <p className="text-[11px] text-emerald-700 truncate">{form.fromStation} → {form.toStation}</p>
                </div>
                <button onClick={() => setTransportSearch("manual")} className="text-zinc-400 hover:text-zinc-600 flex-shrink-0" title="Edit manually">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Manual fields (always shown when manual tab is active) */}
            {transportSearch === "manual" && <>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">
                  {form.transportMode === "flight" ? "Departure airport / city" : form.transportMode === "train" ? "Departure station / city" : "From"}
                </label>
                <input value={form.fromStation} onChange={(e) => set("fromStation", e.target.value)}
                  placeholder={form.transportMode === "flight" ? "e.g. Delhi (DEL) / IGI Airport" : form.transportMode === "train" ? "e.g. New Delhi / NDLS" : "Departure point"}
                  className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">
                  {form.transportMode === "flight" ? "Arrival airport / city" : form.transportMode === "train" ? "Arrival station / city" : "To"}
                </label>
                <input value={form.toStation} onChange={(e) => set("toStation", e.target.value)}
                  placeholder={form.transportMode === "flight" ? "e.g. Mumbai (BOM) / CSIA" : form.transportMode === "train" ? "e.g. Chandigarh / CDG" : "Arrival point"}
                  className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Service / flight / train name</label>
                <input value={form.title} onChange={(e) => set("title", e.target.value)}
                  placeholder={
                    form.transportMode === "flight" ? "e.g. IndiGo 6E-201" :
                    form.transportMode === "train"  ? "e.g. Shatabdi Express 12001" :
                    form.transportMode === "bus"    ? "e.g. HRTC Volvo, Ola Bus" : "Service / vehicle details"
                  }
                  className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
              </div>
            </>}

            <DTPair label="Departure" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="Arrival" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Booking ref / PNR</label>
              <input value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="Ticket / PNR / booking ID"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Seat, platform, luggage, tips..." />
          </>}

          {/* ── PLACE / SIGHT ── */}
          {item.type === "place" && <>
            <LocationField label="Place / Sight name" value={form.title} onChange={(v) => set("title", v)}
              onSelect={(r) => setForm((f) => ({ ...f, title: r.primary, lat: r.lat, lng: r.lng, placeId: r.placeId, region: r.sub }))}
              placeholder="e.g. Taj Mahal, India Gate..." />
            {form.lat && <p className="text-[11px] text-zinc-400 -mt-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.region}</p>}
            <DTPair label="Visit date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Opening hours, dress code, tips..." />
          </>}

          {/* ── SHOPPING ── */}
          {item.type === "shopping" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Shop / Market name</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Sarojini Nagar, local bazaar..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <LocationField label="Location" value={form.region} onChange={(v) => set("region", v)}
              onSelect={(r) => setForm((f) => ({ ...f, region: [r.primary, r.sub].filter(Boolean).join(", "), lat: r.lat, lng: r.lng }))}
              bias={bias} placeholder="Area or address..." />
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="What to buy, budget, bargaining tips..." />
          </>}

          {/* ── NOTE ── */}
          {item.type === "note" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Title (optional)</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Packing list, Reminders..."
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Note</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Write anything..." rows={4} autoFocus
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent resize-none placeholder-zinc-300" />
            </div>
            <DTPair label="Date" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => set("date", v)} onTime={(v) => set("time", v)} />
          </>}

          {/* ── OTHER ── */}
          {item.type === "other" && <>
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What is this?"
                className="w-full text-sm border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-zinc-700 bg-transparent placeholder-zinc-300" />
            </div>
            <DTPair label="Start" date={form.date} time={form.time} minDate={minDate} maxDate={maxDate}
              onDate={(v) => { set("date", v); if (form.endDate < v) set("endDate", ""); }} onTime={(v) => set("time", v)} />
            <DTPair label="End" date={form.endDate} time={form.endTime} minDate={form.date || minDate} maxDate={maxDate}
              onDate={(v) => set("endDate", v)} onTime={(v) => set("endTime", v)} disabled={!form.date} />
            <PriceField price={form.price} currency={form.currency} onPriceChange={(v) => set("price", v)} onCurrencyChange={(v) => set("currency", v)} />
            <NotesField value={form.notes} onChange={(v) => set("notes", v)} placeholder="Any details..." />
          </>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-zinc-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-full transition-all">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}