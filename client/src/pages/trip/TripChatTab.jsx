import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Ban, Trash2, Reply, X, MapPin, Star, Hotel, Utensils, MessageCircle, CornerUpLeft } from "lucide-react";
import api from "../../api/axios";

const POLL_MS = 3000;
const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "😮", "😢", "🙏"];

function Avatar({ user, size = 32 }) {
  const style = { width: size, height: size };
  if (user?.avatar) return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover flex-shrink-0" />;
  return <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">{(user?.name || "?").charAt(0).toUpperCase()}</div>;
}
const timeLabel = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const placeIcon = (cat = "") => (/hotel|resort|stay|lodg/i.test(cat) ? Hotel : /restaur|food|cafe|eat|dining/i.test(cat) ? Utensils : MapPin);

// A shared hotel/restaurant/place card — rendered from denormalized DB data.
function PlaceCard({ place, tint }) {
  const Icon = placeIcon(place.category);
  const maps = place.lat && place.lng ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
  return (
    <a href={maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1.5 block w-60 max-w-full bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-rose-300 transition-colors">
      {place.photo ? (
        <div className="h-24 bg-zinc-100"><img src={place.photo} alt={place.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
      ) : (
        <div className={`h-16 flex items-center justify-center ${tint ? "bg-white/10" : "bg-gradient-to-br from-rose-100 to-blue-100"}`}><Icon className="w-6 h-6 text-rose-400" /></div>
      )}
      <div className="p-2.5">
        <p className="text-sm font-semibold text-zinc-800 truncate flex items-center gap-1"><Icon className="w-3.5 h-3.5 text-zinc-400" /> {place.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {place.category && <span className="text-[11px] text-zinc-400 capitalize truncate">{place.category}</span>}
          {place.rating ? <span className="text-[11px] text-amber-500 inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {Number(place.rating).toFixed(1)}</span> : null}
        </div>
        {place.address && <p className="text-[11px] text-zinc-400 truncate mt-0.5">{place.address}</p>}
      </div>
    </a>
  );
}

// Small quoted preview of the message being replied to.
function ReplyQuote({ reply, light }) {
  if (!reply) return null;
  const who = reply.sender?.username ? `@${reply.sender.username}` : reply.sender?.name || "someone";
  const snippet = reply.deleted ? "deleted message" : reply.type === "place_share" ? `📍 ${reply.sharedPlace?.name || "a place"}` : reply.text || "";
  return (
    <div className={`mb-1 pl-2 border-l-2 ${light ? "border-white/50" : "border-rose-300"} text-xs ${light ? "text-white/80" : "text-zinc-500"} max-w-full`}>
      <span className="font-medium">{who}</span>
      <span className="block truncate italic">{snippet}</span>
    </div>
  );
}

function ActionSheet({ canDelete, onReact, onReply, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xs sm:rounded-2xl rounded-t-2xl p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-8 gap-1 mb-1">
          {EMOJIS.map((e) => <button key={e} onClick={() => onReact(e)} className="text-xl sm:text-2xl py-1.5 rounded-lg hover:bg-zinc-100 active:scale-110 transition-transform">{e}</button>)}
        </div>
        <div className="h-px bg-zinc-100 my-1" />
        <button onClick={onReply} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"><Reply className="w-4 h-4" /> Reply</button>
        {canDelete && (
          <button onClick={onDelete} className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-rose-500 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /> Delete message</button>
        )}
      </div>
    </div>
  );
}

export default function TripChatTab({ trip, isMember, currentUser, isOwner }) {
  const navigate = useNavigate();
  const myId = String(currentUser?._id || currentUser?.id || "");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [msgMenu, setMsgMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const scrollRef = useRef(null);
  const lastAtRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  const nearBottom = () => { const el = scrollRef.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120; };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/trips/${trip._id}/chat?limit=40`);
      setMessages(data.messages);
      setHasOlder(!!data.hasMore);
      setOlderCursor(data.nextCursor || null);
      if (data.messages.length) lastAtRef.current = data.messages[data.messages.length - 1].createdAt;
      scrollToBottom();
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [trip._id]);

  useEffect(() => { if (isMember) load(); }, [isMember, load]);

  useEffect(() => {
    if (!isMember || loading) return;
    const t = setInterval(async () => {
      if (!lastAtRef.current) return;
      try {
        const { data } = await api.get(`/trips/${trip._id}/chat?after=${encodeURIComponent(lastAtRef.current)}`);
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
          if (wasNear) scrollToBottom();
        }
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [trip._id, isMember, loading]);

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlder || !olderCursor) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    try {
      const { data } = await api.get(`/trips/${trip._id}/chat?cursor=${encodeURIComponent(olderCursor)}&limit=30`);
      setMessages((prev) => [...data.messages, ...prev]);
      setHasOlder(!!data.hasMore);
      setOlderCursor(data.nextCursor || null);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch { /* ignore */ } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, olderCursor, trip._id]);

  const onScroll = () => { if (scrollRef.current && scrollRef.current.scrollTop < 60) loadOlder(); };

  const send = async (payload) => {
    setSending(true);
    try {
      const { data } = await api.post(`/trips/${trip._id}/chat`, payload);
      setMessages((prev) => [...prev, data.message]);
      lastAtRef.current = data.message.createdAt;
      scrollToBottom();
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  const sendText = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    const rt = replyTo?._id;
    setReplyTo(null);
    await send({ text: t, ...(rt ? { replyTo: rt } : {}) });
  };

  const toggleReaction = async (mid, emoji) => {
    setMsgMenu(null);
    try {
      const { data } = await api.post(`/trips/${trip._id}/chat/${mid}/react`, { emoji });
      setMessages((prev) => prev.map((m) => (m._id === mid ? data.message : m)));
    } catch { /* ignore */ }
  };

  const deleteMessage = async (mid) => {
    setMsgMenu(null);
    setMessages((prev) => prev.map((m) => (m._id === mid ? { ...m, deleted: true } : m)));
    try {
      const { data } = await api.delete(`/trips/${trip._id}/chat/${mid}`);
      setMessages((prev) => prev.map((m) => (m._id === mid ? data.message : m)));
    } catch { /* ignore */ }
  };

  const startReply = (m) => { setMsgMenu(null); setReplyTo(m); inputRef.current?.focus(); };

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-3 text-center px-8">
        <MessageCircle className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Trip chat is private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view and join this discussion.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col h-full bg-zinc-50">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3">
        {loadingOlder && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-zinc-300" /></div>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>
        ) : (
          <>
            {!hasOlder && (
              <div className="flex flex-col items-center text-center gap-1 pb-2">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center"><MessageCircle className="w-6 h-6" /></div>
                <p className="text-sm font-semibold text-zinc-700">Trip discussion</p>
                <p className="text-xs text-zinc-400">Plan together — share hotels & places from Explore, reply, and react.</p>
              </div>
            )}
            {messages.map((m) => {
              if (m.type === "system") {
                return <div key={m._id} id={`tmsg-${m._id}`} className="flex justify-center"><span className="text-xs text-zinc-400 italic bg-zinc-100 rounded-full px-3 py-1">{m.text}</span></div>;
              }
              const mine = String(m.sender?._id) === myId;
              return (
                <div key={m._id} id={`tmsg-${m._id}`} className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && <Avatar user={m.sender} size={32} />}
                  <div className={`max-w-[80%] min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!mine && <span className="text-xs text-zinc-400 mb-0.5 px-1">@{m.sender?.username || m.sender?.name}</span>}
                    {m.deleted ? (
                      <div className="rounded-2xl px-3 py-2 text-sm bg-zinc-100 text-zinc-400 italic inline-flex items-center gap-1.5 rounded-bl-sm">
                        <Ban className="w-3.5 h-3.5 flex-shrink-0" /> {m.deletedByAdmin ? "This message was deleted by admin" : "This message was deleted"}
                      </div>
                    ) : (
                      <div onClick={() => setMsgMenu(m)} className={`rounded-2xl px-3 py-2 text-sm cursor-pointer active:brightness-95 transition ${mine ? "bg-rose-500 text-white rounded-br-sm" : "bg-white border border-zinc-100 text-zinc-700 rounded-bl-sm"}`}>
                        {m.replyTo && <ReplyQuote reply={m.replyTo} light={mine} />}
                        {m.text && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                        {m.type === "place_share" && m.sharedPlace && <PlaceCard place={m.sharedPlace} tint={mine} />}
                      </div>
                    )}
                    {!m.deleted && m.reactions?.length > 0 && (
                      <div className={`flex items-center gap-1 mt-1 flex-wrap ${mine ? "flex-row-reverse" : ""}`}>
                        {m.reactions.map((r) => {
                          const reacted = (r.users || []).some((u) => String(u._id || u) === myId);
                          return (
                            <button key={r.emoji} onClick={() => toggleReaction(m._id, r.emoji)} className={`text-xs px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 transition-colors ${reacted ? "bg-rose-50 border-rose-200" : "bg-white border-zinc-200 hover:border-zinc-300"}`}>
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
            })}
          </>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 sm:px-6 py-2 bg-white border-t border-zinc-100">
          <CornerUpLeft className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 border-l-2 border-rose-300 pl-2">
            <p className="text-xs font-medium text-zinc-500">Replying to @{replyTo.sender?.username || replyTo.sender?.name}</p>
            <p className="text-xs text-zinc-400 truncate italic">{replyTo.deleted ? "deleted message" : replyTo.type === "place_share" ? `📍 ${replyTo.sharedPlace?.name || "a place"}` : replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Composer */}
      <form onSubmit={sendText} className="flex items-center gap-2 px-3 sm:px-6 py-3 bg-white border-t border-zinc-100 flex-shrink-0">
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the trip…" className="flex-1 bg-zinc-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-200" />
        <button type="submit" disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {msgMenu && (
        <ActionSheet
          canDelete={String(msgMenu.sender?._id) === myId || isOwner}
          onReact={(emoji) => toggleReaction(msgMenu._id, emoji)}
          onReply={() => startReply(msgMenu)}
          onDelete={() => deleteMessage(msgMenu._id)}
          onClose={() => setMsgMenu(null)}
        />
      )}
    </div>
  );
}
