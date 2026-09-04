import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Hand, Eye, Pencil, Sparkles } from "lucide-react";
import api from "../api/axios";
import UserSearchSelect from "../components/UserSearchSelect";
import { ROLE_META } from "../lib/roles";

const STEPS = ["destination", "name", "dates", "invite", "confirm"];
const TODAY = new Date().toISOString().split("T")[0];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function fetchDestinationPhoto(query) {
  const key = import.meta.env.VITE_UNSPLASH_KEY;
  if (!key || !query) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    const data = await res.json();
    return data.results?.[0]?.urls?.regular || null;
  } catch {
    return null;
  }
}

async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();

    return data.map((p) => {
      const a = p.address || {};

      // The most specific place name (city > town > village > county > state)
      const city = a.city || a.town || a.village || a.municipality || a.county || null;
      const state = a.state || a.region || null;
      const country = a.country || null;

      // Display name: most specific part
      const primaryName = city || state || p.name;

      // Full label shown under the name: city → state, country OR state, country
      const parts = [];
      if (city && state) parts.push(state);
      if (country) parts.push(country);
      const subLabel = parts.join(", ");

      // Full location string for selected display (e.g. "Tirumala, Andhra Pradesh, India")
      const fullParts = [city, state, country].filter(Boolean);
      // Deduplicate consecutive identical values
      const deduplicated = fullParts.filter((v, i) => v !== fullParts[i - 1]);
      const fullLabel = deduplicated.join(", ");

      return {
        primaryName,        // shown bold in dropdown
        subLabel,           // shown grey below in dropdown
        fullLabel,          // shown in input after selection & on card
        placeId: p.place_id?.toString(),
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lon),
        city,
        state,
        country,
      };
    }).filter((p) => p.primaryName);
  } catch {
    return [];
  }
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-zinc-900">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : null;

function CancelModal({ onKeep, onDiscard }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <p className="text-xl font-semibold text-zinc-900 mb-2 flex items-center gap-2"><Hand className="w-5 h-5 text-rose-500" /> Slow down!</p>
        <p className="text-sm text-zinc-500 mb-6">
          {"You're about to cancel creating your trip. Are you sure you'd like to do that?"}
        </p>
        <div className="h-px bg-zinc-100 mb-5" />
        <div className="flex items-center justify-end gap-3">
          <button onClick={onKeep} className="px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-all">
            No, keep it.
          </button>
          <button onClick={onDiscard} className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-all">
            Yes, cancel it!
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateTrip() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [destQuery, setDestQuery] = useState("");
  const [destination, setDestination] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [destPhoto, setDestPhoto] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoAbortRef = useRef(null);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateError, setDateError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [invitees, setInvitees] = useState([]);

  const debouncedQuery = useDebounce(destQuery, 350);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setSuggestions([]); return; }
    if (destination && debouncedQuery === destination.fullLabel) return;
    setSearching(true);
    searchPlaces(debouncedQuery).then((results) => { setSuggestions(results); setSearching(false); });
  }, [debouncedQuery]);

  const selectDestination = useCallback(async (place) => {
    setDestination(place);
    setDestQuery(place.fullLabel); // show full "City, State, Country" in input
    setSuggestions([]);

    const myRequest = {};
    photoAbortRef.current = myRequest;
    setPhotoLoading(true);
    setDestPhoto(null);
    // Search photo using full label for better results
    const photo = await fetchDestinationPhoto(place.fullLabel);
    if (photoAbortRef.current === myRequest) { setDestPhoto(photo); setPhotoLoading(false); }
  }, []);

  const next = () => { setError(""); setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => { setError(""); setStep((s) => Math.max(s - 1, 0)); };

  const handleStartDateChange = (val) => {
    setDateError("");
    if (val < TODAY) { setDateError("Start date cannot be in the past."); return; }
    setStartDate(val);
    if (endDate && endDate < val) setEndDate("");
  };

  const handleEndDateChange = (val) => {
    setDateError("");
    if (val < startDate) { setDateError("End date cannot be before start date."); return; }
    setEndDate(val);
  };

  const handleCancelClick = () => setShowCancelModal(true);
  const handleKeep = () => setShowCancelModal(false);
  const handleDiscard = () => { setShowCancelModal(false); navigate("/dashboard"); };

  const addInvitee = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (invitees.some((i) => i.key === email)) return;
    setInvitees((prev) => [...prev, { key: email, email, role: inviteRole }]);
    setInviteEmail("");
  };

  const addUserInvitee = (user) => {
    const key = `user:${user._id}`;
    if (invitees.some((i) => i.key === key)) return;
    setInvitees((prev) => [
      ...prev,
      { key, userId: user._id, username: user.username, name: user.name, avatar: user.avatar, role: inviteRole },
    ]);
  };

  const removeInvitee = (key) => setInvitees((prev) => prev.filter((i) => i.key !== key));

  // Instantly change an already-added invitee's role — it's all local state
  // until the trip is created, so a mis-set role is trivially fixed.
  const setInviteeRole = (key, role) =>
    setInvitees((prev) => prev.map((i) => (i.key === key ? { ...i, role } : i)));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/trips", {
        name: name.trim() || destination?.primaryName || "My Trip",
        destination: destination
          ? {
              name: destination.primaryName,
              fullLabel: destination.fullLabel,
              placeId: destination.placeId,
              city: destination.city,
              state: destination.state,
              country: destination.country,
              coordinates: { lat: destination.lat, lng: destination.lng },
            }
          : { name: destQuery || "TBD" },
        startDate: startDate || null,
        endDate: endDate || null,
        coverPhoto: destPhoto || null,
      });
      const tripId = res.data.trip._id;
      await Promise.allSettled(
        invitees.map((inv) =>
          api.post(
            `/trips/${tripId}/invite`,
            inv.username ? { username: inv.username, role: inv.role } : { email: inv.email, role: inv.role }
          )
        )
      );
      navigate(`/trips/${tripId}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create trip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const daysBetween = startDate && endDate
    ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
    : null;

  const previewName = name.trim() || destination?.primaryName || "Your trip";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {showCancelModal && <CancelModal onKeep={handleKeep} onDiscard={handleDiscard} />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-100">
        <button onClick={() => navigate("/dashboard")} className="flex items-baseline leading-none" aria-label="Wohoo.in home">
          <span className="font-serif text-xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">Wohoo</span>
          <span className="font-serif text-xl font-bold tracking-tight text-zinc-900">.in</span>
        </button>
        <div className="flex gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${i === step ? "w-6 h-2.5 bg-rose-500" : i < step ? "w-2.5 h-2.5 bg-rose-300" : "w-2.5 h-2.5 bg-zinc-200"}`} />
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={handleCancelClick} className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">Cancel</button>
          <button onClick={() => setStep(STEPS.length - 1)} className="text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors">Skip all</button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Left panel */}
        <div className="flex-1 flex flex-col justify-center px-5 sm:px-10 lg:px-16 py-8 sm:py-12 max-w-xl w-full">
          {step > 0 && (
            <button onClick={back} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-600 mb-10 transition-colors w-fit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}

          {/* STEP 0 — Destination */}
          {step === 0 && (
            <div>
              <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase mb-4">Plan your trip</p>
              <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 mb-8 leading-tight">{"What's your first destination?"}</h2>
              <div className="relative">
                <input
                  type="text"
                  value={destQuery}
                  onChange={(e) => { setDestQuery(e.target.value); setDestination(null); }}
                  placeholder="Search city, state or country..."
                  className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-3 text-zinc-800 text-base transition-colors bg-transparent"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-0 top-3">
                    <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-zinc-100 rounded-xl shadow-xl mt-1 overflow-hidden z-20">
                    {suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        onClick={() => selectDestination(s)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          {/* Primary name with highlight */}
                          <p className="text-sm text-zinc-700">{highlightMatch(s.primaryName, destQuery)}</p>
                          {/* State, Country below */}
                          {s.subLabel && <p className="text-xs text-zinc-400">{s.subLabel}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected destination confirmation */}
              {destination && (
                <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {destination.fullLabel}
                </div>
              )}

              <button onClick={next} disabled={!destQuery.trim()} className="mt-10 w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-full transition-all">
                Next
              </button>
            </div>
          )}

          {/* STEP 1 — Name */}
          {step === 1 && (
            <div>
              <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 mb-8 leading-tight">{"Let's give your trip a name!"}</h2>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My awesome trip..."
                autoFocus
                className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-3 text-zinc-800 text-base transition-colors bg-transparent"
              />
              {!name && destination?.primaryName && (
                <p className="text-xs text-zinc-400 mt-2">
                  Defaults to &quot;{destination.primaryName}&quot; if left empty
                </p>
              )}
              <button onClick={next} className="mt-10 w-full bg-rose-500 hover:bg-rose-600 text-white font-medium py-3.5 rounded-full transition-all">Next</button>
              <button onClick={next} className="mt-3 w-full text-sm text-zinc-400 hover:text-zinc-600 py-2 transition-colors">Skip</button>
            </div>
          )}

          {/* STEP 2 — Dates */}
          {step === 2 && (
            <div>
              <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 mb-2 leading-tight">
                When are you going{destination ? ` to ${destination.primaryName}` : ""}?
              </h2>
              <button
                onClick={() => { setStartDate(""); setEndDate(""); setDateError(""); }}
                className="text-sm border border-zinc-200 rounded-full px-4 py-1.5 text-zinc-400 mb-8 hover:border-zinc-300 transition-colors"
              >
                Not sure yet!
              </button>
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Start Date</label>
                  <input type="date" value={startDate} min={TODAY} onChange={(e) => handleStartDateChange(e.target.value)} className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-3 text-zinc-800 text-base transition-colors bg-transparent" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">End Date</label>
                  <input type="date" value={endDate} min={startDate || TODAY} disabled={!startDate} onChange={(e) => handleEndDateChange(e.target.value)} className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-3 text-zinc-800 text-base transition-colors bg-transparent disabled:opacity-40 disabled:cursor-not-allowed" />
                  {!startDate && <p className="text-xs text-zinc-400 mt-1">Select a start date first</p>}
                </div>
              </div>
              {dateError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-red-500">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {dateError}
                </div>
              )}
              <button onClick={next} disabled={!!dateError} className="mt-10 w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-full transition-all">Next</button>
              <button onClick={next} className="mt-3 w-full text-sm text-zinc-400 hover:text-zinc-600 py-2 transition-colors">Skip</button>
            </div>
          )}

          {/* STEP 3 — Invite */}
          {step === 3 && (
            <div>
              <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 mb-8 leading-tight">Invite your friends to collaborate!</h2>

              {/* Access level (applies to whoever you add next) */}
              <div className="flex gap-2 mb-2">
                {["viewer", "editor"].map((r) => (
                  <button key={r} onClick={() => setInviteRole(r)} className={`text-xs px-3 py-1.5 rounded-full border transition-all inline-flex items-center gap-1.5 ${inviteRole === r ? "bg-rose-50 border-rose-300 text-rose-600" : "border-zinc-200 text-zinc-400 hover:border-zinc-300"}`}>
                    {r === "viewer" ? <><Eye className="w-3.5 h-3.5" /> Can view</> : <><Pencil className="w-3.5 h-3.5" /> Can edit</>}
                  </button>
                ))}
              </div>
              {/* Explain what the selected default role can do. */}
              <p className="text-xs text-zinc-400 mb-4">{ROLE_META[inviteRole].can} You can change each person's role below.</p>

              {/* Search people by username */}
              <UserSearchSelect
                actionLabel="Add"
                onSelect={addUserInvitee}
                disabledIds={invitees.map((i) => i.userId).filter(Boolean)}
                placeholder="Search people by username…"
              />

              {/* Or add by email */}
              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-zinc-100 flex-1" />
                <span className="text-xs text-zinc-400">or invite by email</span>
                <div className="h-px bg-zinc-100 flex-1" />
              </div>
              <div className="flex gap-2 items-end mb-6">
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInvitee()} placeholder="Enter an email address" className="flex-1 border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-3 text-zinc-800 text-sm transition-colors bg-transparent" />
                <button onClick={addInvitee} className="text-zinc-400 hover:text-rose-500 transition-colors pb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>

              {invitees.map((inv) => {
                const label = inv.username ? `@${inv.username}` : inv.email;
                const letter = (inv.name || inv.email || "?")[0].toUpperCase();
                return (
                  <div key={inv.key} className="flex items-center gap-3 py-3 border-b border-zinc-100">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center flex-shrink-0">
                      {inv.avatar ? <img src={inv.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rose-500">{letter}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-700 truncate">{inv.name || label}</p>
                      {inv.name && <p className="text-xs text-zinc-400 truncate">{label}</p>}
                    </div>
                    {/* Instant per-person role toggle */}
                    <div className="flex items-center rounded-full border border-zinc-200 overflow-hidden text-[11px] flex-shrink-0" role="group" aria-label={`Role for ${inv.name || label}`}>
                      {["viewer", "editor"].map((r) => (
                        <button
                          key={r}
                          onClick={() => setInviteeRole(inv.key, r)}
                          aria-pressed={inv.role === r}
                          title={ROLE_META[r].can}
                          className={`px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${inv.role === r ? "bg-rose-50 text-rose-600 font-medium" : "text-zinc-400 hover:text-zinc-600"}`}
                        >
                          {r === "viewer" ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                          {r === "viewer" ? "View" : "Edit"}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeInvitee(inv.key)} title="Remove" className="text-zinc-300 hover:text-rose-400 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              <div className="flex gap-3 mt-10">
                <button className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-3 rounded-full transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Copy Link
                </button>
                <button onClick={next} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium py-3 rounded-full transition-all">Continue</button>
              </div>
            </div>
          )}

          {/* STEP 4 — Confirm */}
          {step === 4 && (
            <div>
              <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 mb-3 leading-tight">{"You're all set!"}</h2>
              <p className="text-zinc-400 text-sm mb-8">Review your trip before creating it.</p>
              <div className="space-y-1">
                {[
                  { label: "Destination", value: destination?.fullLabel || destQuery || "—" },
                  { label: "Trip name", value: name.trim() || destination?.primaryName || "—" },
                  { label: "Dates", value: startDate && endDate ? `${formatDate(startDate)} → ${formatDate(endDate)}` : "Not set" },
                  { label: "Duration", value: daysBetween ? `${daysBetween} days` : null },
                  { label: "Invited", value: invitees.length > 0 ? `${invitees.length} friend${invitees.length > 1 ? "s" : ""}` : "Just me" },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-3 border-b border-zinc-100">
                    <span className="text-sm text-zinc-400">{row.label}</span>
                    <span className="text-sm font-medium text-zinc-800">{row.value}</span>
                  </div>
                ))}
              </div>
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-500 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
              <button onClick={handleSubmit} disabled={loading} className="mt-10 w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium py-3.5 rounded-full transition-all flex items-center justify-center gap-2">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating...</>
                ) : <>Create Trip <Sparkles className="w-4 h-4" /></>}
              </button>
            </div>
          )}
        </div>

        {/* Right preview */}
        <div className="hidden lg:flex flex-1 items-center justify-center bg-zinc-50/50 p-16">
          <div className="w-72 bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="h-44 bg-zinc-100 relative overflow-hidden">
              {photoLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
                  <div className="w-6 h-6 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
                </div>
              )}
              {destPhoto && !photoLoading && (
                <img src={destPhoto} alt={destination?.primaryName} className="w-full h-full object-cover transition-opacity duration-500" />
              )}
              {!destPhoto && !photoLoading && (
                <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064" />
                  </svg>
                </div>
              )}
              <div className="absolute bottom-3 left-3 flex -space-x-1">
                <div className="w-7 h-7 rounded-full border-2 border-white bg-rose-200 flex items-center justify-center">
                  <span className="text-xs font-bold text-rose-600">AB</span>
                </div>
                {invitees.slice(0, 2).map((inv) => (
                  <div key={inv.key} className="w-7 h-7 rounded-full border-2 border-white bg-blue-200 flex items-center justify-center overflow-hidden">
                    {inv.avatar
                      ? <img src={inv.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold text-blue-600">{(inv.name || inv.email || "?")[0].toUpperCase()}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <p className="font-semibold text-zinc-800 text-sm">{previewName}</p>
              {/* Show full City, State, Country on card */}
              {destination?.fullLabel && (
                <p className="text-xs text-zinc-400 mt-0.5">{destination.fullLabel}</p>
              )}
              <p className="text-xs text-zinc-400 mt-0.5">
                {startDate && endDate
                  ? `${formatDate(startDate)} · ${daysBetween} days`
                  : startDate ? formatDate(startDate) : "Dates not set"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}