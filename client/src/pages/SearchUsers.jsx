import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function UserCard({ user, onClick }) {
  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  return (
    <div
      onClick={() => onClick(user.username)}
      className="flex items-center gap-4 p-4 rounded-2xl border border-zinc-100 hover:border-rose-200 hover:bg-rose-50/30 cursor-pointer transition-all group"
    >
      <div className="w-12 h-12 rounded-full bg-rose-200 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-rose-100 group-hover:ring-rose-200 transition-all">
        {user.avatar ? (
          <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
        ) : (
          <span className="text-sm font-bold text-rose-600">{initials(user.name)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-800 text-sm">{user.name}</p>
        <p className="text-xs text-zinc-400 mt-0.5">@{user.username}</p>
      </div>
      <svg className="w-4 h-4 text-zinc-300 group-hover:text-rose-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

export default function SearchUsers() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  const debouncedQuery = useDebounce(query, 300);

  // Load recommendations on mount (random users with usernames)
  useEffect(() => {
    api.get("/users/search?q=a")
      .then((res) => setRecommendations(res.data.users || []))
      .catch(() => {})
      .finally(() => setLoadingRecs(false));
  }, []);

  // Search on debounced query change
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    setSearching(true);
    api.get(`/users/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => setResults(res.data.users || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQuery]);

  const goToProfile = (username) => navigate(`/u/${username}`);

  const displayUsers = query.length >= 2 ? results : recommendations;
  const showingSearch = query.length >= 2;

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-zinc-100">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button className="flex items-baseline leading-none" onClick={() => navigate("/dashboard")} aria-label="Wohoo.in home">
          <span className="font-serif text-xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">Wohoo</span>
          <span className="font-serif text-xl font-bold tracking-tight text-zinc-900">.in</span>
        </button>
        <div className="w-16" />
      </nav>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Find people</h1>
        <p className="text-zinc-400 text-sm mb-8">Search by username to find and visit profiles</p>

        {/* Search input */}
        <div className="relative mb-8">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            {searching ? (
              <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username..."
            autoFocus
            className="w-full pl-11 pr-4 py-3.5 bg-zinc-50 border border-zinc-200 focus:border-rose-400 focus:bg-white outline-none rounded-2xl text-zinc-800 text-sm transition-all"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Results / Recommendations */}
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            {showingSearch ? `Results for "${query}"` : "People you might know"}
          </p>

          {showingSearch && results.length === 0 && !searching && (
            <div className="text-center py-10">
              <p className="text-zinc-400 text-sm">No users found for &quot;{query}&quot;</p>
              <p className="text-zinc-300 text-xs mt-1">Try a different username</p>
            </div>
          )}

          {!showingSearch && loadingRecs && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-zinc-100 animate-pulse" />
              ))}
            </div>
          )}

          {displayUsers.length > 0 && (
            <div className="space-y-2">
              {displayUsers.map((u) => (
                <UserCard key={u._id} user={u} onClick={goToProfile} />
              ))}
            </div>
          )}

          {/* Own profile link */}
          {currentUser?.username && (
            <div className="mt-8 pt-8 border-t border-zinc-100">
              <p className="text-xs text-zinc-400 mb-3">Your profile</p>
              <UserCard user={currentUser} onClick={goToProfile} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}