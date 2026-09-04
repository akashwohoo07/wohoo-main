import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, Heart, MapPin, Users } from "lucide-react";
import api from "../api/axios";
import TopNav from "../components/TopNav";

function DiscoverCard({ trip, saved, onToggle }) {
  const navigate = useNavigate();
  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const dest = trip.destination?.fullLabel || trip.destination?.name;
  const formatRange = (s, e) => {
    if (!s) return null;
    const start = new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short" });
    if (!e) return start;
    const end = new Date(e).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    return `${start} – ${end}`;
  };

  return (
    <div
      onClick={() => navigate(`/trips/${trip._id}`)}
      className="bg-white rounded-2xl border border-zinc-100 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
    >
      <div className="h-44 bg-gradient-to-br from-zinc-200 to-zinc-300 relative overflow-hidden">
        {trip.coverPhoto ? (
          <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100 flex items-center justify-center">
            <MapPin className="w-10 h-10 text-zinc-300" />
          </div>
        )}
        {/* Heart save */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(trip); }}
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          aria-pressed={saved}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow hover:scale-105 transition-transform"
        >
          <Heart className={`w-5 h-5 ${saved ? "fill-rose-500 text-rose-500" : "text-zinc-400"}`} />
        </button>
      </div>
      <div className="p-4">
        <p className="font-semibold text-zinc-800 text-sm truncate">{trip.name}</p>
        {dest && <p className="text-xs text-zinc-400 mt-0.5 truncate flex items-center gap-1"><MapPin className="w-3 h-3" /> {dest}</p>}
        <div className="flex items-center justify-between mt-2">
          {(trip.startDate || trip.endDate) && (
            <p className="text-xs text-zinc-400">{formatRange(trip.startDate, trip.endDate)}</p>
          )}
          <span className="text-xs text-zinc-400 flex items-center gap-1 ml-auto">
            <Users className="w-3 h-3" /> {trip.membersCount || 1}
          </span>
        </div>
        {trip.owner && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-50">
            <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {trip.owner.avatar ? (
                <img src={trip.owner.avatar} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-[10px] font-bold text-rose-600">{initials(trip.owner.name)}</span>
              )}
            </div>
            <span className="text-xs text-zinc-400 truncate">
              {trip.owner.username ? `@${trip.owner.username}` : trip.owner.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Discover() {
  const [q, setQ] = useState("");
  const [trips, setTrips] = useState([]);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const debounceRef = useRef(null);

  // The set of refIds already in the wishlist → filled hearts.
  useEffect(() => {
    api.get("/discover/wishlist/keys")
      .then((res) => setSavedIds(new Set(res.data.refIds || [])))
      .catch(() => {});
  }, []);

  const fetchTrips = useCallback(async (query, cur) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (cur) params.set("cursor", cur);
      const res = await api.get(`/discover/trips?${params.toString()}`);
      setTrips((prev) => (cur ? [...prev, ...res.data.trips] : res.data.trips));
      setHasMore(res.data.hasMore);
      setCursor(res.data.nextCursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTrips(q, null), 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, fetchTrips]);

  const toggleSave = async (trip) => {
    const id = trip._id;
    const isSaved = savedIds.has(id);
    // Optimistic
    setSavedIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (isSaved) {
        await api.delete(`/discover/wishlist/${id}`);
      } else {
        await api.post("/discover/wishlist", {
          kind: "trip",
          refId: id,
          title: trip.name,
          subtitle: trip.destination?.fullLabel || trip.destination?.name || "",
          image: trip.coverPhoto || "",
        });
      }
    } catch (err) {
      console.error(err);
      // Revert on failure
      setSavedIds((prev) => {
        const next = new Set(prev);
        isSaved ? next.add(id) : next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <TopNav active="discover" />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-serif text-zinc-900 mb-1">Discover trips</h1>
        <p className="text-sm text-zinc-400 mb-6">Explore public trips shared by the Wohoo community.</p>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <SearchIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or destination…"
            aria-label="Search public trips"
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition"
          />
        </div>

        {loading && trips.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="rounded-2xl bg-zinc-100 animate-pulse h-72" />)}
          </div>
        ) : trips.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {trips.map((trip) => (
                <DiscoverCard key={trip._id} trip={trip} saved={savedIds.has(trip._id)} onToggle={toggleSave} />
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchTrips(q, cursor)}
                  disabled={loading}
                  className="text-sm font-medium text-rose-500 hover:text-rose-600 border border-rose-200 hover:border-rose-300 px-6 py-2.5 rounded-full transition disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-12 text-center">
            <p className="text-zinc-400 text-sm">{q ? `No public trips match “${q}”.` : "No public trips yet. Be the first to make one public!"}</p>
          </div>
        )}
      </main>
    </div>
  );
}
