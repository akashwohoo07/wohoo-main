import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, X, Loader2, CheckCheck, MapPin, Users, CheckCircle2, Ban } from "lucide-react";
import api from "../api/axios";

// For a resolved actionable notification (invite/request that's no longer
// pending), the chip that replaces the Accept/Reject buttons. Driven by the
// server's derived `outcome`, so it's always in sync with the platform.
function resolvedChip(n) {
  if (n.actionable) return null;
  if (n.type !== "trip_invite" && n.type !== "community_request") return null;
  const isTrip = n.type === "trip_invite";
  switch (n.outcome) {
    case "accepted":
      return { label: isTrip ? "Joined trip" : "Accepted", tone: "green" };
    case "declined":
    case "rejected":
      return { label: "Declined", tone: "gray" };
    case "cancelled":
      return { label: isTrip ? "Invite cancelled" : "Request withdrawn", tone: "gray" };
    case "expired":
      return { label: "Invite expired", tone: "gray" };
    default:
      return null;
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function Avatar({ user, size = 36 }) {
  const style = { width: size, height: size };
  if (user?.avatar) return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover flex-shrink-0" />;
  return (
    <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
      {(user?.name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

const POLL_MS = 45000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const ref = useRef(null);

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setCount(data.count || 0);
    } catch { /* ignore */ }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications?limit=20");
      setItems(data.notifications || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Poll the unread count so the badge stays fresh without per-user server state.
  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(t);
  }, [fetchCount]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchList();
  };

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setCount((c) => Math.max(0, c - 1));
    try { await api.patch(`/notifications/${id}/read`); } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
    try { await api.patch("/notifications/read-all"); } catch { /* ignore */ }
  };

  // Flip an actionable notification to its resolved state in place — the buttons
  // become a chip instead of the row vanishing (keeps a record + matches the
  // rest of the platform). `outcome` mirrors the server's derived value.
  const resolveLocally = (id, outcome) =>
    setItems((prev) => prev.map((x) => (x._id === id ? { ...x, actionable: false, outcome, status: outcome, read: true } : x)));

  // Trip invite accept/decline.
  const respond = async (n, action) => {
    if (!n.token) return;
    setActingId(n._id);
    try {
      await api.post(`/trips/invitations/${n.token}/respond`, { action });
      resolveLocally(n._id, action === "accept" ? "accepted" : "declined");
      fetchCount();
      if (action === "accept" && n.trip?._id) { setOpen(false); navigate(`/trips/${n.trip._id}`); }
    } catch {
      // The invite was likely already handled/cancelled elsewhere — re-sync so
      // the stale buttons disappear rather than lingering.
      fetchList(); fetchCount();
    } finally {
      setActingId(null);
    }
  };

  // Community join-request accept/reject (owner).
  const respondRequest = async (n, action) => {
    if (!n.community?._id || !n.request) return;
    setActingId(n._id);
    try {
      await api.post(`/communities/${n.community._id}/requests/${n.request}/respond`, { action });
      resolveLocally(n._id, action === "accept" ? "accepted" : "rejected");
      fetchCount();
    } catch {
      fetchList(); fetchCount();
    } finally {
      setActingId(null);
    }
  };

  // Where a notification points: its community or its trip.
  const targetOf = (n) => (n.community?._id ? `/communities/${n.community._id}` : n.trip?._id ? `/trips/${n.trip._id}` : null);

  const openTarget = (n) => {
    const to = targetOf(n);
    if (!n.read) markRead(n._id);
    setOpen(false);
    if (to) navigate(to);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={() => setOpen(false)} />
          {/* Mobile: fixed full-width sheet near the top (the bell isn't at the screen edge,
              so an absolute dropdown would overflow off-screen). Desktop: anchored dropdown. */}
          <div className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <h3 className="text-sm font-semibold text-zinc-900">Notifications</h3>
              {items.some((n) => !n.read) && (
                <button onClick={markAllRead} className="text-xs text-rose-500 hover:text-rose-600 font-medium inline-flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-6">
                  <Bell className="w-9 h-9 text-zinc-200" strokeWidth={1.5} />
                  <p className="text-sm text-zinc-400">You're all caught up.</p>
                </div>
              ) : (
                items.map((n) => {
                  // Show Accept/Reject only while the invite/request is LIVE and
                  // still pending — the server derives `actionable` from the
                  // linked invitation/request, so a resolved/cancelled/expired one
                  // never shows stale buttons. Otherwise render a resolved chip.
                  const isInvite = n.type === "trip_invite" && n.actionable;
                  const isRequest = n.type === "community_request" && n.actionable;
                  const chip = resolvedChip(n);
                  const busy = actingId === n._id;
                  const to = targetOf(n);
                  const viewLabel = n.community?._id ? "View community" : "View trip";
                  return (
                    <div key={n._id} className={`px-4 py-3 border-b border-zinc-50 last:border-0 ${n.read ? "" : "bg-rose-50/40"}`}>
                      <div className="flex gap-3">
                        {/* Clicking the round avatar opens the community/trip. */}
                        <button
                          onClick={() => openTarget(n)}
                          disabled={!to}
                          className={`flex-shrink-0 rounded-full ${to ? "hover:ring-2 hover:ring-rose-200 transition-all cursor-pointer" : "cursor-default"}`}
                          title={to ? viewLabel : undefined}
                        >
                          <Avatar user={n.actor} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <button onClick={() => openTarget(n)} disabled={!to} className={`block text-left ${to ? "cursor-pointer" : "cursor-default"}`}>
                            <p className="text-sm text-zinc-700 leading-snug">{n.message}</p>
                          </button>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{timeAgo(n.createdAt)}</p>

                          {isInvite ? (
                            <div className="flex items-center gap-2 mt-2">
                              <button onClick={() => respond(n, "accept")} disabled={busy} className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-all">
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept
                              </button>
                              <button onClick={() => respond(n, "decline")} disabled={busy} className="flex items-center gap-1 border border-zinc-200 hover:border-zinc-300 text-zinc-500 text-xs font-medium px-3 py-1.5 rounded-full transition-all">
                                <X className="w-3.5 h-3.5" /> Decline
                              </button>
                              {to && <button onClick={() => openTarget(n)} className="text-xs text-zinc-400 hover:text-rose-500 ml-auto inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> View</button>}
                            </div>
                          ) : isRequest ? (
                            <div className="flex items-center gap-2 mt-2">
                              <button onClick={() => respondRequest(n, "accept")} disabled={busy} className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-all">
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept
                              </button>
                              <button onClick={() => respondRequest(n, "reject")} disabled={busy} className="flex items-center gap-1 border border-zinc-200 hover:border-zinc-300 text-zinc-500 text-xs font-medium px-3 py-1.5 rounded-full transition-all">
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                              {to && <button onClick={() => openTarget(n)} className="text-xs text-zinc-400 hover:text-rose-500 ml-auto inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> View</button>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {chip && (
                                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${chip.tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500"}`}>
                                  {chip.tone === "green" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />} {chip.label}
                                </span>
                              )}
                              {to && (
                                <button onClick={() => openTarget(n)} className="text-xs text-rose-500 hover:text-rose-600 font-medium inline-flex items-center gap-1">
                                  {n.community?._id ? <Users className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />} {viewLabel}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {!n.read && !isInvite && !isRequest && (
                          <button onClick={() => markRead(n._id)} title="Mark read" className="text-zinc-300 hover:text-zinc-500 flex-shrink-0">
                            <span className="block w-2 h-2 rounded-full bg-rose-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
