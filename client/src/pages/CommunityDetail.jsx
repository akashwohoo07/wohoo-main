import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Hash, Lock, Send, Users, Loader2, MapPin, Plane, X, Check, Trash2, LogOut, Calendar, Plus, UserMinus, UserRound, Ban, Search,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { creatorLabel } from "./Communities";

const POLL_MS = 3000;
const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "😮", "😢", "🙏"];

function Avatar({ user, size = 34 }) {
  const style = { width: size, height: size };
  if (user?.avatar) return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover flex-shrink-0" />;
  return <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">{(user?.name || "?").charAt(0).toUpperCase()}</div>;
}

const timeLabel = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Highlight @mentions inside message text.
function MessageText({ text }) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("@") ? <span key={i} className="text-rose-500 font-medium bg-rose-50 rounded px-0.5">{p}</span> : p
      )}
    </span>
  );
}

function SharedTripCard({ trip, navigate }) {
  if (!trip) return null;
  const dates = trip.startDate ? new Date(trip.startDate).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;
  return (
    <button onClick={(e) => { e.stopPropagation(); navigate(`/trips/${trip._id}`); }} className="mt-1.5 w-64 max-w-full text-left bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-rose-300 transition-colors">
      <div className="h-24 bg-gradient-to-br from-rose-100 to-blue-100 relative">
        {trip.coverPhoto && <img src={trip.coverPhoto} alt="" className="w-full h-full object-cover" />}
        <span className="absolute top-2 left-2 bg-white/90 text-[11px] font-medium text-zinc-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Plane className="w-3 h-3" /> Trip</span>
      </div>
      <div className="p-2.5">
        <p className="text-sm font-semibold text-zinc-800 truncate">{trip.name}</p>
        <p className="text-xs text-zinc-400 truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.destination?.fullLabel || trip.destination?.name || "Somewhere"}</p>
        {dates && <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> {dates}</p>}
      </div>
    </button>
  );
}

// Pick one of my trips to share into the chat.
function TripPicker({ onPick, onClose }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/trips").then(({ data }) => setTrips([...(data.upcoming || []), ...(data.past || [])])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900">Share a trip</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto space-y-2">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
            : trips.length === 0 ? <p className="text-sm text-zinc-400 text-center py-8">You have no trips to share yet.</p>
            : trips.map((t) => (
              <button key={t._id} onClick={() => onPick(t)} className="w-full flex items-center gap-3 border border-zinc-100 rounded-xl p-2.5 hover:border-rose-300 text-left">
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-gradient-to-br from-rose-100 to-blue-100 flex-shrink-0">
                  {t.coverPhoto && <img src={t.coverPhoto} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{t.name}</p>
                  <p className="text-xs text-zinc-400 truncate">{t.destination?.fullLabel || t.destination?.name}</p>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function MembersPanel({ community, members, requests, canManage, onRespond, onClose, onLeave, onDelete, onRemove, isOwner, myId }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h3 className="font-semibold text-zinc-900">Members · {community.membersCount}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {canManage && requests.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Requests</h4>
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r._id} className="flex items-center gap-2.5">
                    <Avatar user={r.user} size={32} />
                    <div className="flex-1 min-w-0"><p className="text-sm text-zinc-700 truncate">{r.user.name}</p><p className="text-xs text-zinc-400 truncate">@{r.user.username}</p></div>
                    <button onClick={() => onRespond(r._id, "accept")} className="p-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600"><Check className="w-4 h-4" /></button>
                    <button onClick={() => onRespond(r._id, "reject")} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">All members</h4>
            <div className="space-y-2">
              {members.map((m) => {
                const canRemove = isOwner && m.role !== "owner" && String(m.user._id) !== String(myId);
                return (
                  <div key={m._id} className="flex items-center gap-2.5 group">
                    <Avatar user={m.user} size={32} />
                    <div className="flex-1 min-w-0"><p className="text-sm text-zinc-700 truncate">{m.user.name}</p><p className="text-xs text-zinc-400 truncate">@{m.user.username}</p></div>
                    {m.role !== "member" && <span className="text-[11px] font-medium text-rose-500 capitalize">{m.role}</span>}
                    {canRemove && (
                      <button
                        onClick={() => onRemove(m.user)}
                        title={`Remove ${m.user.name}`}
                        className="text-xs font-medium text-zinc-400 hover:text-rose-500 border border-zinc-200 hover:border-rose-200 px-2.5 py-1 rounded-full transition-all inline-flex items-center gap-1"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div className="p-4 border-t border-zinc-100">
          {isOwner ? (
            <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-rose-500 border border-rose-200 hover:bg-rose-50 py-2.5 rounded-full"><Trash2 className="w-4 h-4" /> Delete community</button>
          ) : (
            <button onClick={onLeave} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-zinc-500 border border-zinc-200 hover:bg-zinc-50 py-2.5 rounded-full"><LogOut className="w-4 h-4" /> Leave community</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tapping a member's avatar in chat opens this sheet: view profile, and (owner
// only) remove them from the community.
function MemberActionSheet({ user, canRemove, onRemove, onClose, navigate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xs sm:rounded-2xl rounded-t-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <Avatar user={user} size={48} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">{user.name}</p>
            <p className="text-xs text-zinc-400 truncate">@{user.username}</p>
          </div>
        </div>
        <div className="space-y-1">
          {user.username && (
            <button onClick={() => navigate(`/u/${user.username}`)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
              <UserRound className="w-4 h-4 text-zinc-400" /> View profile
            </button>
          )}
          {canRemove && (
            <button onClick={() => onRemove(user)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-rose-500 hover:bg-rose-50 transition-colors">
              <UserMinus className="w-4 h-4" /> Remove from community
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tap a message → react with an emoji, or delete it (if allowed). Bottom sheet
// on mobile, centered card on desktop — so it works on touch and mouse alike.
function MessageActionSheet({ canDelete, onReact, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xs sm:rounded-2xl rounded-t-2xl p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-8 gap-1 mb-1">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => onReact(e)} className="text-xl sm:text-2xl py-1.5 rounded-lg hover:bg-zinc-100 active:scale-110 transition-transform">{e}</button>
          ))}
        </div>
        {canDelete && (
          <>
            <div className="h-px bg-zinc-100 my-1" />
            <button onClick={onDelete} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-rose-500 hover:bg-rose-50 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete message
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-zinc-900 mb-1.5">{title}</h3>
        <p className="text-sm text-zinc-500 mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-all">Cancel</button>
          <button onClick={onConfirm} className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-all">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [community, setCommunity] = useState(null);
  const [locked, setLocked] = useState(false);
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [actionUser, setActionUser] = useState(null); // user whose avatar was tapped in chat
  const [confirmRemove, setConfirmRemove] = useState(null); // user pending removal confirmation
  const [hasOlder, setHasOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [msgMenu, setMsgMenu] = useState(null); // message whose action sheet is open
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const scrollRef = useRef(null);
  const lastAtRef = useRef(null);
  const inputRef = useRef(null);

  // @mention autocomplete state
  const [mention, setMention] = useState(null); // { query, atPos, caret } | null
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionList = mention
    ? members
        .map((m) => m.user)
        .filter((u) => {
          if (!u?.username) return false;
          const q = mention.query.toLowerCase();
          return !q || u.username.toLowerCase().startsWith(q) || (u.name || "").toLowerCase().includes(q);
        })
        .slice(0, 8)
    : [];

  const canManage = community?.myRole === "owner" || community?.myRole === "admin";
  const isOwner = community?.myRole === "owner";
  const myId = user?._id || user?.id;
  const creator = community ? creatorLabel(community, myId) : null;

  const scrollToBottom = () => {
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  };
  const nearBottom = () => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Infinite scroll up: load older history, preserving the viewport position.
  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlder || !olderCursor) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    try {
      const { data } = await api.get(`/communities/${id}/messages?cursor=${encodeURIComponent(olderCursor)}&limit=30`);
      setMessages((prev) => [...data.messages, ...prev]);
      setHasOlder(!!data.hasMore);
      setOlderCursor(data.nextCursor || null);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch { /* ignore */ } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, olderCursor, id]);

  const onScroll = () => { if (scrollRef.current && scrollRef.current.scrollTop < 60) loadOlder(); };

  const toggleReaction = async (messageId, emoji) => {
    setReactionFor(null);
    try {
      const { data } = await api.post(`/communities/${id}/messages/${messageId}/react`, { emoji });
      setMessages((prev) => prev.map((m) => (m._id === messageId ? data.message : m)));
    } catch { /* ignore */ }
  };

  // Debounced in-chat search.
  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/communities/${id}/messages/search?q=${encodeURIComponent(q)}`);
        setSearchResults(data.messages);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen, id]);

  const jumpToMessage = (mid) => {
    setSearchOpen(false); setSearchQ(""); setSearchResults([]);
    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${mid}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-rose-300", "rounded-2xl");
        setTimeout(() => el.classList.remove("ring-2", "ring-rose-300", "rounded-2xl"), 1600);
      }
    });
  };

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/communities/${id}`);
      setCommunity(data.community);
      setLocked(!!data.locked);
      setRequested(!!data.requested);
      if (!data.locked) {
        const [msgs, mem] = await Promise.all([
          api.get(`/communities/${id}/messages?limit=40`),
          api.get(`/communities/${id}/members`),
        ]);
        setMessages(msgs.data.messages);
        setMembers(mem.data.members);
        setHasOlder(!!msgs.data.hasMore);
        setOlderCursor(msgs.data.nextCursor || null);
        if (msgs.data.messages.length) lastAtRef.current = msgs.data.messages[msgs.data.messages.length - 1].createdAt;
        api.patch(`/communities/${id}/read`).catch(() => {});
        scrollToBottom();
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  // Load pending requests for managers.
  useEffect(() => {
    if (canManage) api.get(`/communities/${id}/requests`).then(({ data }) => setRequests(data.requests)).catch(() => {});
  }, [canManage, id, showMembers]);

  // Poll for new messages while viewing (near-real-time).
  useEffect(() => {
    if (locked || loading) return;
    const t = setInterval(async () => {
      if (!lastAtRef.current) return;
      try {
        const { data } = await api.get(`/communities/${id}/messages?after=${encodeURIComponent(lastAtRef.current)}`);
        // Merge edits to existing messages (reactions, deletions) in place.
        if (data.updated?.length) {
          const byId = new Map(data.updated.map((m) => [m._id, m]));
          setMessages((prev) => prev.map((m) => (byId.has(m._id) ? byId.get(m._id) : m)));
        }
        if (data.messages?.length) {
          const wasNear = nearBottom();
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m._id));
            const fresh = data.messages.filter((m) => !seen.has(m._id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          lastAtRef.current = data.messages[data.messages.length - 1].createdAt;
          if (wasNear) scrollToBottom(); // don't yank users who scrolled up
        }
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, locked, loading]);

  const send = async (payload) => {
    setSending(true);
    try {
      const { data } = await api.post(`/communities/${id}/messages`, payload);
      setMessages((prev) => [...prev, data.message]);
      lastAtRef.current = data.message.createdAt;
      scrollToBottom();
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  const sendText = async (e) => {
    e?.preventDefault();
    if (mention) return; // don't send while the mention menu is open
    const t = text.trim();
    if (!t) return;
    setText("");
    setMention(null);
    await send({ text: t });
  };

  // Detect an active "@query" immediately before the caret (start of line or
  // after whitespace) — this is what opens the member typeahead, Slack-style.
  const onComposerChange = (e) => {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(/(?:^|\s)@(\w*)$/);
    if (m) {
      setMention({ query: m[1], atPos: caret - m[1].length - 1, caret });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  };

  const insertMention = (u) => {
    if (!mention) return;
    const before = text.slice(0, mention.atPos);
    const after = text.slice(mention.caret);
    const inserted = `${before}@${u.username} ${after}`;
    setText(inserted);
    setMention(null);
    const pos = (before + `@${u.username} `).length;
    requestAnimationFrame(() => {
      if (inputRef.current) { inputRef.current.focus(); inputRef.current.setSelectionRange(pos, pos); }
    });
  };

  const onComposerKeyDown = (e) => {
    if (!mention || mentionList.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionList.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionList.length) % mentionList.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionList[mentionIndex]); }
    else if (e.key === "Escape") { e.preventDefault(); setMention(null); }
  };

  const shareTrip = async (trip) => {
    setShowTripPicker(false);
    await send({ type: "trip_share", tripId: trip._id, text: "" });
  };

  const requestJoin = async () => {
    try { await api.post(`/communities/${id}/request`); setRequested(true); } catch { /* ignore */ }
  };

  const respondRequest = async (reqId, action) => {
    try {
      await api.post(`/communities/${id}/requests/${reqId}/respond`, { action });
      setRequests((prev) => prev.filter((r) => r._id !== reqId));
      if (action === "accept") {
        const mem = await api.get(`/communities/${id}/members`);
        setMembers(mem.data.members);
        setCommunity((c) => ({ ...c, membersCount: mem.data.members.length }));
      }
    } catch { /* ignore */ }
  };

  // Ask for confirmation first (from the members panel or the chat avatar sheet).
  const askRemove = (user) => { setActionUser(null); setConfirmRemove(user); };

  const removeMember = async (userId) => {
    setConfirmRemove(null);
    try {
      await api.delete(`/communities/${id}/members/${userId}`);
      setMembers((prev) => prev.filter((m) => String(m.user._id) !== String(userId)));
      setCommunity((c) => ({ ...c, membersCount: Math.max(1, (c.membersCount || 1) - 1) }));
    } catch { /* ignore */ }
  };

  const deleteMessage = async (messageId) => {
    // Optimistic tombstone, reconciled with the server response.
    setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, deleted: true } : m)));
    try {
      const { data } = await api.delete(`/communities/${id}/messages/${messageId}`);
      setMessages((prev) => prev.map((m) => (m._id === messageId ? data.message : m)));
    } catch { /* ignore */ }
  };

  const leave = async () => { try { await api.post(`/communities/${id}/leave`); navigate("/communities"); } catch { /* ignore */ } };
  const del = async () => { if (!confirm("Delete this community for everyone?")) return; try { await api.delete(`/communities/${id}`); navigate("/communities"); } catch { /* ignore */ } };

  if (loading) return <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>;
  if (!community) return <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-zinc-50"><p className="text-zinc-500">Community not found.</p><button onClick={() => navigate("/communities")} className="text-rose-500 text-sm">Back to communities</button></div>;

  return (
    <div className="h-[100dvh] flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-zinc-100 flex-shrink-0">
        <button onClick={() => navigate("/communities")} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center font-bold flex-shrink-0">{community.name.charAt(0).toUpperCase()}</div>
        <button onClick={() => !locked && setShowMembers(true)} className="min-w-0 text-left">
          <p className="text-sm font-semibold text-zinc-900 truncate inline-flex items-center gap-1">
            {community.type === "private" ? <Lock className="w-3.5 h-3.5 text-zinc-400" /> : <Hash className="w-3.5 h-3.5 text-zinc-400" />}
            {community.name}
          </p>
          <p className="text-xs text-zinc-400 truncate">{creator ? `created by ${creator} · ` : ""}{community.membersCount} members</p>
        </button>
        {!locked && (
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={() => setSearchOpen(true)} className="p-2 rounded-full hover:bg-zinc-100 text-zinc-500" title="Search messages"><Search className="w-5 h-5" /></button>
            <button onClick={() => setShowMembers(true)} className="p-2 rounded-full hover:bg-zinc-100 text-zinc-500" title="Members"><Users className="w-5 h-5" /></button>
          </div>
        )}
      </header>

      {locked ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center"><Lock className="w-7 h-7 text-zinc-400" /></div>
          <div>
            <h2 className="font-semibold text-zinc-800">This community is private</h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-xs">Request to join and an admin will review it.</p>
          </div>
          {requested ? (
            <span className="text-sm text-emerald-600 inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Request sent</span>
          ) : (
            <button onClick={requestJoin} className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-6 py-2.5 rounded-full">Request to join</button>
          )}
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3">
            {/* Loading older history (infinite scroll up) */}
            {loadingOlder && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-zinc-300" /></div>}

            {/* Chat intro: only once we've reached the very beginning */}
            {!hasOlder && (
              <div className="flex flex-col items-center text-center gap-1 pb-2">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center font-bold text-lg">{community.name.charAt(0).toUpperCase()}</div>
                <p className="text-sm font-semibold text-zinc-700 inline-flex items-center gap-1">
                  {community.type === "private" ? <Lock className="w-3.5 h-3.5 text-zinc-400" /> : <Hash className="w-3.5 h-3.5 text-zinc-400" />}{community.name}
                </p>
                {creator && <p className="text-xs text-zinc-400">Created by {creator}</p>}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 text-center text-zinc-400 py-6">
                <p className="text-xs">Say hi, share a trip, or @mention someone.</p>
              </div>
            ) : (
              messages.map((m) => {
                // System notices (joined/left/removed) render as a centered italic pill.
                if (m.type === "system") {
                  return (
                    <div key={m._id} id={`msg-${m._id}`} className="flex justify-center">
                      <span className="text-xs text-zinc-400 italic bg-zinc-100 rounded-full px-3 py-1">{m.text}</span>
                    </div>
                  );
                }
                const mine = String(m.sender?._id) === String(user?._id || user?.id);
                return (
                  <div key={m._id} id={`msg-${m._id}`} className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                    {!mine && (
                      <button onClick={() => setActionUser(m.sender)} className="flex-shrink-0 rounded-full hover:ring-2 hover:ring-rose-200 transition-all self-end" title={m.sender?.name}>
                        <Avatar user={m.sender} size={32} />
                      </button>
                    )}
                    <div className={`max-w-[80%] min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!mine && <span className="text-xs text-zinc-400 mb-0.5 px-1">@{m.sender?.username || m.sender?.name}</span>}
                      {m.deleted ? (
                        <div className="rounded-2xl px-3 py-2 text-sm bg-zinc-100 text-zinc-400 italic inline-flex items-center gap-1.5 rounded-bl-sm">
                          <Ban className="w-3.5 h-3.5 flex-shrink-0" /> {m.deletedByAdmin ? "This message was deleted by admin" : "This message was deleted"}
                        </div>
                      ) : (
                        // Tap/click the bubble to react or delete — works on touch and desktop.
                        <div
                          onClick={() => setMsgMenu(m)}
                          className={`rounded-2xl px-3 py-2 text-sm cursor-pointer select-text active:brightness-95 transition ${mine ? "bg-rose-500 text-white rounded-br-sm" : "bg-white border border-zinc-100 text-zinc-700 rounded-bl-sm"}`}
                        >
                          {m.text && <MessageText text={m.text} />}
                          {m.type === "trip_share" && <SharedTripCard trip={m.sharedTrip} navigate={navigate} />}
                        </div>
                      )}

                      {/* Reaction chips (tap to toggle) */}
                      {!m.deleted && (m.reactions?.length > 0) && (
                        <div className={`flex items-center gap-1 mt-1 flex-wrap ${mine ? "flex-row-reverse" : ""}`}>
                          {m.reactions.map((r) => {
                            const reacted = (r.users || []).some((u) => String(u._id || u) === String(myId));
                            return (
                              <button key={r.emoji} onClick={() => toggleReaction(m._id, r.emoji)}
                                className={`text-xs px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 transition-colors ${reacted ? "bg-rose-50 border-rose-200" : "bg-white border-zinc-200 hover:border-zinc-300"}`}>
                                <span>{r.emoji}</span><span className="text-zinc-500">{r.users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <span className="text-[10px] text-zinc-300 mt-0.5 px-1">{timeLabel(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <form onSubmit={sendText} className="relative flex items-center gap-2 px-3 sm:px-6 py-3 bg-white border-t border-zinc-100 flex-shrink-0">
            {/* @mention typeahead */}
            {mention && mentionList.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 sm:left-6 sm:right-6 mb-2 bg-white rounded-xl shadow-2xl border border-zinc-100 py-1 max-h-60 overflow-y-auto z-20">
                <p className="px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Members</p>
                {mentionList.map((u, i) => (
                  <button
                    type="button"
                    key={u._id}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === mentionIndex ? "bg-rose-50" : "hover:bg-zinc-50"}`}
                  >
                    <Avatar user={u} size={28} />
                    <span className="text-sm font-medium text-zinc-700 truncate">{u.name}</span>
                    <span className="text-xs text-zinc-400 truncate">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setShowTripPicker(true)} title="Share a trip" className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-rose-500 hover:bg-rose-50 flex-shrink-0"><Plane className="w-5 h-5" /></button>
            <input
              ref={inputRef}
              value={text}
              onChange={onComposerChange}
              onKeyDown={onComposerKeyDown}
              onBlur={() => setTimeout(() => setMention(null), 120)}
              placeholder="Message… use @ to mention"
              className="flex-1 bg-zinc-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-200"
            />
            <button type="submit" disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </>
      )}

      {showMembers && (
        <MembersPanel community={community} members={members} requests={requests} canManage={canManage}
          onRespond={respondRequest} onClose={() => setShowMembers(false)} onLeave={leave} onDelete={del}
          onRemove={askRemove} isOwner={isOwner} myId={myId} />
      )}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-100">
            <button onClick={() => { setSearchOpen(false); setSearchQ(""); setSearchResults([]); }} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search messages…" className="w-full bg-zinc-100 rounded-full pl-9 pr-9 py-2.5 text-sm outline-none" />
              {searching && <Loader2 className="w-4 h-4 text-zinc-300 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {searchQ.trim().length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-10">Search this community's messages.</p>
            ) : searchResults.length === 0 && !searching ? (
              <p className="text-sm text-zinc-400 text-center py-10">No messages match “{searchQ.trim()}”.</p>
            ) : (
              searchResults.map((m) => (
                <button key={m._id} onClick={() => jumpToMessage(m._id)} className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-50 text-left">
                  <Avatar user={m.sender} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-400">@{m.sender?.username || m.sender?.name} · {timeLabel(m.createdAt)}</p>
                    <p className="text-sm text-zinc-700 truncate">{m.text || (m.type === "trip_share" ? "Shared a trip" : "")}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {msgMenu && (
        <MessageActionSheet
          canDelete={String(msgMenu.sender?._id) === String(myId) || isOwner}
          onReact={(emoji) => { toggleReaction(msgMenu._id, emoji); setMsgMenu(null); }}
          onDelete={() => { deleteMessage(msgMenu._id); setMsgMenu(null); }}
          onClose={() => setMsgMenu(null)}
        />
      )}
      {showTripPicker && <TripPicker onPick={shareTrip} onClose={() => setShowTripPicker(false)} />}
      {actionUser && (
        <MemberActionSheet
          user={actionUser}
          canRemove={isOwner && String(actionUser._id) !== String(community.owner?._id || community.owner) && String(actionUser._id) !== String(myId)}
          onRemove={askRemove}
          onClose={() => setActionUser(null)}
          navigate={navigate}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove member?"
          message={`Remove ${confirmRemove.name} (@${confirmRemove.username}) from this community? They'll lose access to the chat and can rejoin later.`}
          confirmLabel="Remove"
          onConfirm={() => removeMember(confirmRemove._id)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
