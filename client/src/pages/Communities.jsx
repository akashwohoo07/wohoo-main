import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Users, Hash, Lock, Plus, X, Loader2, Globe, Check } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";

// "you" if the viewer owns it, else "@username" — used to disambiguate
// communities that share the same name.
export function creatorLabel(community, myId) {
  const owner = community?.owner;
  if (!owner) return null;
  const ownerId = owner._id || owner;
  if (myId && String(ownerId) === String(myId)) return "you";
  return owner.username ? `@${owner.username}` : owner.name || "someone";
}

function CommunityAvatar({ community, size = 44 }) {
  const style = { width: size, height: size };
  if (community.avatar) return <img src={community.avatar} alt={community.name} style={style} className="rounded-xl object-cover flex-shrink-0" />;
  return (
    <div style={style} className="rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center font-bold flex-shrink-0">
      {community.name.charAt(0).toUpperCase()}
    </div>
  );
}

function CommunityName({ community, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {community.type === "private" ? <Lock className="w-3.5 h-3.5 text-zinc-400" /> : <Hash className="w-3.5 h-3.5 text-zinc-400" />}
      {community.name}
    </span>
  );
}

function CreateCommunityModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/communities", { name: name.trim(), description: description.trim(), type });
      onCreated(data.community);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create community");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-900">Create a community</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="Goa Trippers"
              className="w-full mt-1.5 border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2 text-zinc-800 bg-transparent" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description <span className="text-zinc-300 normal-case font-normal">· optional</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="What's this community about?"
              className="w-full mt-1.5 border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-700 outline-none focus:border-rose-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Type</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {[
                { id: "public", icon: Globe, label: "Public", desc: "Anyone can find & join" },
                { id: "private", icon: Lock, label: "Private", desc: "Join by request only" },
              ].map((o) => {
                const Icon = o.icon;
                return (
                  <button key={o.id} onClick={() => setType(o.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${type === o.id ? "bg-rose-50 border-rose-300" : "border-zinc-200 hover:border-zinc-300"}`}>
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${type === o.id ? "text-rose-600" : "text-zinc-600"}`}><Icon className="w-4 h-4" /> {o.label}</div>
                    <p className="text-xs text-zinc-400 mt-0.5">{o.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button onClick={submit} disabled={saving || !name.trim()}
            className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-medium py-3 rounded-full transition-all flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create community
          </button>
        </div>
      </div>
    </div>
  );
}

function CommunityRow({ community, onOpen, onJoin, onRequest, busy, requested, myId }) {
  const isMember = community.isMember;
  const isPrivate = community.type === "private";
  const creator = creatorLabel(community, myId);
  return (
    <div className="flex items-center gap-3 bg-white border border-zinc-100 rounded-2xl p-3 hover:border-zinc-200 transition-colors">
      <button onClick={() => onOpen(community)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <CommunityAvatar community={community} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800 truncate"><CommunityName community={community} /></p>
          {creator && <p className="text-xs text-zinc-400 truncate">created by {creator} · {community.membersCount} member{community.membersCount === 1 ? "" : "s"}</p>}
          {community.description && <p className="text-xs text-zinc-300 truncate">{community.description}</p>}
        </div>
      </button>
      {isMember ? (
        <button onClick={() => onOpen(community)} className="text-xs font-medium text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-full border border-rose-200 flex-shrink-0">Open</button>
      ) : isPrivate ? (
        <button onClick={() => onRequest(community)} disabled={busy || requested} className={`text-xs font-medium px-3 py-1.5 rounded-full flex-shrink-0 inline-flex items-center gap-1 ${requested ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : requested ? <><Check className="w-3.5 h-3.5" /> Requested</> : <><Lock className="w-3.5 h-3.5" /> Request</>}
        </button>
      ) : (
        <button onClick={() => onJoin(community)} disabled={busy} className="text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-full flex-shrink-0 inline-flex items-center gap-1">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Join
        </button>
      )}
    </div>
  );
}

export default function Communities() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myId = user?._id || user?.id;
  const [mode, setMode] = useState("community"); // "community" | "people"
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [owned, setOwned] = useState([]);
  const [joined, setJoined] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [requestedIds, setRequestedIds] = useState([]);
  const debounceRef = useRef(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/communities/mine");
      setOwned(data.owned);
      setJoined(data.joined);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < (mode === "community" ? 1 : 2)) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = mode === "community" ? `/communities/search?q=${encodeURIComponent(query)}` : `/users/search?q=${encodeURIComponent(query)}`;
        const { data } = await api.get(url);
        setResults(mode === "community" ? data.communities : data.users);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, mode]);

  const openCommunity = (c) => navigate(`/communities/${c._id}`);

  const join = async (c) => {
    setBusyId(c._id);
    try {
      await api.post(`/communities/${c._id}/join`);
      openCommunity(c);
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  const requestJoin = async (c) => {
    setBusyId(c._id);
    try {
      await api.post(`/communities/${c._id}/request`);
      setRequestedIds((prev) => [...prev, c._id]);
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  const showingSearch = q.trim().length >= 1;

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-100">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/dashboard")} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2"><Users className="w-5 h-5 text-rose-500" /> Communities</h1>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium pl-3 pr-4 py-2 rounded-full transition-all">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Create</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {/* Search + toggle */}
        <div className="mb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "community" ? "Search communities…" : "Search people by username…"}
              className="w-full bg-white border border-zinc-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-rose-400" />
            {searching && <Loader2 className="w-4 h-4 text-zinc-300 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-zinc-400">Searching for:</span>
            <div className="flex gap-1 bg-zinc-100 rounded-full p-0.5">
              {[{ id: "community", label: "Communities" }, { id: "people", label: "People" }].map((o) => (
                <button key={o.id} onClick={() => { setMode(o.id); setResults([]); }}
                  className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${mode === o.id ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500"}`}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>

        {showingSearch ? (
          <div className="space-y-2">
            {results.length === 0 && !searching ? (
              <p className="text-sm text-zinc-400 text-center py-10">No {mode === "community" ? "communities" : "people"} found for “{q.trim()}”.</p>
            ) : mode === "community" ? (
              results.map((c) => (
                <CommunityRow key={c._id} community={c} myId={myId}
                  onOpen={openCommunity} onJoin={join} onRequest={requestJoin}
                  busy={busyId === c._id} requested={requestedIds.includes(c._id)} />
              ))
            ) : (
              results.map((u) => (
                <button key={u._id} onClick={() => navigate(`/u/${u.username}`)} className="w-full flex items-center gap-3 bg-white border border-zinc-100 rounded-2xl p-3 hover:border-zinc-200 text-left">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center flex-shrink-0">
                    {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : <span className="font-semibold text-rose-600">{u.name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{u.name}</p>
                    <p className="text-xs text-zinc-400 truncate">@{u.username}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>
        ) : owned.length === 0 && joined.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <Users className="w-12 h-12 text-zinc-200" strokeWidth={1.5} />
            <h3 className="font-semibold text-zinc-700">No communities yet</h3>
            <p className="text-sm text-zinc-400 max-w-xs">Create one or search public communities to join and start chatting.</p>
            <button onClick={() => setShowCreate(true)} className="mt-1 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Create community</button>
          </div>
        ) : (
          <div className="space-y-6">
            {owned.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">My communities</h2>
                <div className="space-y-2">
                  {owned.map((c) => <CommunityRow key={c._id} community={c} myId={myId} onOpen={openCommunity} />)}
                </div>
              </section>
            )}
            {joined.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Joined</h2>
                <div className="space-y-2">
                  {joined.map((c) => <CommunityRow key={c._id} community={c} myId={myId} onOpen={openCommunity} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} onCreated={(c) => { setShowCreate(false); navigate(`/communities/${c._id}`); }} />}
    </div>
  );
}
