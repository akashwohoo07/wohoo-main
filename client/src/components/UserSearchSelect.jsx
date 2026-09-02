import { useState, useEffect, useRef } from "react";
import { Search, UserPlus, Check, Loader2 } from "lucide-react";
import api from "../api/axios";

function Avatar({ user, size = 34 }) {
  const style = { width: size, height: size };
  if (user?.avatar) return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover flex-shrink-0" />;
  const letter = (user?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
      {letter}
    </div>
  );
}

/**
 * Reusable username search with live recommendations. Each result shows an
 * action button ("Invite"/"Add"). Purely presentational about the action —
 * the parent decides what onSelect does (invite immediately, or stage a list).
 *
 * Props:
 *  - onSelect(user)  called when the action button is clicked
 *  - actionLabel     button label (default "Invite")
 *  - disabledIds     user ids already added → shown as "Added"
 *  - busyId          user id with an in-flight action → spinner
 *  - placeholder
 */
export default function UserSearchSelect({
  onSelect,
  actionLabel = "Invite",
  disabledIds = [],
  busyId = null,
  placeholder = "Search by username…",
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
        setResults(data.users || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const disabled = new Set(disabledIds.map(String));

  return (
    <div>
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setTouched(true); }}
          placeholder={placeholder}
          className="w-full border border-zinc-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-rose-400 transition-colors"
        />
        {loading && <Loader2 className="w-4 h-4 text-zinc-300 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
          {results.length === 0 && !loading ? (
            <p className="text-xs text-zinc-400 px-1 py-3 text-center">No users found for “{q.trim()}”.</p>
          ) : (
            results.map((u) => {
              const isDisabled = disabled.has(String(u._id));
              const isBusy = String(busyId) === String(u._id);
              return (
                <div key={u._id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-50 transition-colors">
                  <Avatar user={u} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{u.name}</p>
                    <p className="text-xs text-zinc-400 truncate">@{u.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isDisabled && !isBusy && onSelect(u)}
                    disabled={isDisabled || isBusy}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all flex-shrink-0 ${
                      isDisabled
                        ? "bg-emerald-50 text-emerald-600 cursor-default"
                        : "bg-rose-500 hover:bg-rose-600 text-white active:scale-95"
                    }`}
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : isDisabled ? <><Check className="w-3.5 h-3.5" /> Added</>
                      : <><UserPlus className="w-3.5 h-3.5" /> {actionLabel}</>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {!touched && (
        <p className="text-xs text-zinc-400 mt-2">Type at least 2 characters to search people by username.</p>
      )}
    </div>
  );
}
