import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, Star, X } from "lucide-react";
import api from "../api/axios";
import TopNav from "../components/TopNav";

const KIND_LABELS = {
  all: "All",
  trip: "Trips",
  place: "Places",
  restaurant: "Eats",
  hotel: "Hotels",
  stay: "Stays",
  activity: "Activities",
  sight: "Sights",
};

function WishlistCard({ item, onRemove }) {
  const navigate = useNavigate();
  const openable = item.kind === "trip" && item.trip;
  return (
    <div
      onClick={() => openable && navigate(`/trips/${item.trip}`)}
      className={`bg-white rounded-2xl border border-zinc-100 overflow-hidden transition-all duration-200 group ${openable ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : ""}`}
    >
      <div className="h-40 bg-gradient-to-br from-zinc-200 to-zinc-300 relative overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100 flex items-center justify-center">
            <MapPin className="w-10 h-10 text-zinc-300" />
          </div>
        )}
        <span className="absolute top-3 left-3 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/90 backdrop-blur text-zinc-500 capitalize">
          {item.kind}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item); }}
          aria-label="Remove from wishlist"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow hover:scale-105 transition-transform"
        >
          <X className="w-4 h-4 text-zinc-500" />
        </button>
      </div>
      <div className="p-4">
        <p className="font-semibold text-zinc-800 text-sm truncate">{item.title}</p>
        {item.subtitle && <p className="text-xs text-zinc-400 mt-0.5 truncate">{item.subtitle}</p>}
        {typeof item.rating === "number" && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {item.rating.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Wishlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  const fetchItems = useCallback(async (k, cur) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (k && k !== "all") params.set("kind", k);
      if (cur) params.set("cursor", cur);
      const res = await api.get(`/discover/wishlist?${params.toString()}`);
      setItems((prev) => (cur ? [...prev, ...res.data.items] : res.data.items));
      setHasMore(res.data.hasMore);
      setCursor(res.data.nextCursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(kind, null); }, [kind, fetchItems]);

  const remove = async (item) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i._id !== item._id)); // optimistic
    try {
      await api.delete(`/discover/wishlist/${item._id}`);
    } catch (err) {
      console.error(err);
      setItems(prev); // revert
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <TopNav active="wishlist" />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-serif text-zinc-900 mb-1">Your wishlist</h1>
        <p className="text-sm text-zinc-400 mb-6">Trips and places you've saved from Discover and Explore.</p>

        {/* Kind filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`text-xs font-medium px-3.5 py-1.5 rounded-full border transition ${
                kind === k
                  ? "bg-rose-500 border-rose-500 text-white"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="rounded-2xl bg-zinc-100 animate-pulse h-64" />)}
          </div>
        ) : items.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((item) => <WishlistCard key={item._id} item={item} onRemove={remove} />)}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchItems(kind, cursor)}
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
            <Heart className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm mb-4">
              {kind === "all" ? "Your wishlist is empty." : `No saved ${KIND_LABELS[kind].toLowerCase()} yet.`}
            </p>
            <button
              onClick={() => navigate("/discover")}
              className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-6 py-2.5 rounded-full transition-all"
            >
              Discover trips
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
