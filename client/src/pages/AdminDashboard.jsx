import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, UserPlus, Activity, Clock, Plane, MessagesSquare, Search, Loader2, X, TrendingUp, Eye, Globe,
} from "lucide-react";
import api from "../api/axios";

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-1"><Icon className="w-4 h-4" /><span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Lightweight dependency-free bar chart.
function BarChart({ data, valueKey, label, color = "bg-rose-400" }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-zinc-400" /><h3 className="text-sm font-semibold text-zinc-700">{label}</h3></div>
      {data.length === 0 ? (
        <p className="text-xs text-zinc-400 py-8 text-center">No data yet.</p>
      ) : (
        <div className="flex items-end gap-0.5 h-28">
          {data.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end group relative" title={`${d.day}: ${d[valueKey]}`}>
              <div className={`w-full ${color} rounded-t transition-all group-hover:opacity-80`} style={{ height: `${(d[valueKey] / max) * 100}%`, minHeight: d[valueKey] > 0 ? 2 : 0 }} />
            </div>
          ))}
        </div>
      )}
      {data.length > 0 && (
        <div className="flex justify-between text-[10px] text-zinc-300 mt-1"><span>{data[0].day.slice(5)}</span><span>{data[data.length - 1].day.slice(5)}</span></div>
      )}
    </div>
  );
}

// Ranked list with proportional bars (top pages / sources / devices).
function TrafficList({ icon: Icon, title, items }) {
  const max = Math.max(1, ...(items || []).map((i) => i.count));
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-zinc-400" /><h3 className="text-sm font-semibold text-zinc-700">{title}</h3></div>
      {!items || items.length === 0 ? (
        <p className="text-xs text-zinc-400 py-4 text-center">No data yet.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={i.key} className="relative">
              <div className="absolute inset-y-0 left-0 bg-rose-50 rounded" style={{ width: `${(i.count / max) * 100}%` }} />
              <div className="relative flex justify-between px-2 py-1 text-xs">
                <span className="text-zinc-600 truncate mr-2">{i.key}</span>
                <span className="text-zinc-400 tabular-nums flex-shrink-0">{i.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserDetailModal({ userId, onClose, navigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/admin/users/${userId}`).then(({ data }) => setData(data)).catch(() => {});
  }, [userId]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-zinc-900">User detail</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>
        {!data ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center flex-shrink-0">
                {data.user.avatar ? <img src={data.user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="font-bold text-rose-600">{(data.user.name || "?").charAt(0).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 truncate">{data.user.name}</p>
                <p className="text-sm text-zinc-400 truncate">{data.user.email}{data.user.username ? ` · @${data.user.username}` : ""}</p>
              </div>
              {data.user.username && <button onClick={() => navigate(`/u/${data.user.username}`)} className="ml-auto text-xs text-rose-500 hover:text-rose-600 flex-shrink-0">Profile →</button>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={Clock} label="Total time" value={fmtMin(data.totalMinutes)} />
              <StatCard icon={Activity} label="Last seen" value={fmtDateTime(data.lastSeenAt)} />
              <StatCard icon={Plane} label="Trips owned" value={data.tripsOwned} />
              <StatCard icon={Users} label="Trips joined" value={data.tripsJoined} />
            </div>
            <p className="text-xs text-zinc-400">Joined {fmtDate(data.user.createdAt)} · {data.user.followersCount || 0} followers</p>
            <BarChart data={data.activityPerDay} valueKey="minutes" label="Active minutes / day (30d)" color="bg-emerald-400" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const debounce = useRef(null);

  useEffect(() => {
    api.get("/admin/overview").then(({ data }) => setOverview(data)).catch(() => {});
  }, []);

  const loadUsers = useCallback(async (query, reset) => {
    const params = new URLSearchParams({ limit: "25" });
    if (query) params.set("q", query);
    if (!reset && cursor) params.set("cursor", cursor);
    const { data } = await api.get(`/admin/users?${params}`);
    setUsers((prev) => (reset ? data.users : [...prev, ...data.users]));
    setHasMore(data.hasMore);
    setCursor(data.nextCursor);
  }, [cursor]);

  useEffect(() => {
    setLoading(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try { await loadUsers(q, true); } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const t = overview?.totals;

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-100">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/dashboard")} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-semibold text-zinc-900">Admin · Analytics</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total users" value={t ? t.users : "—"} sub={t ? `+${t.users7d} this week` : ""} />
          <StatCard icon={UserPlus} label="New today" value={t ? t.usersToday : "—"} />
          <StatCard icon={Activity} label="Active today" value={t ? t.activeToday : "—"} sub={t ? `~${t.avgMinutesTodayPerActive}m avg` : ""} />
          <StatCard icon={Plane} label="Trips" value={t ? t.trips : "—"} />
          <StatCard icon={MessagesSquare} label="Messages" value={t ? t.messages : "—"} />
          <StatCard icon={Eye} label="Pageviews today" value={overview ? overview.traffic.pageviewsToday : "—"} />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-3">
          <BarChart data={overview?.signupsPerDay || []} valueKey="count" label="Signups / day (30d)" color="bg-rose-400" />
          <BarChart data={overview?.activityPerDay || []} valueKey="minutes" label="Active minutes / day (30d)" color="bg-emerald-400" />
        </div>

        {/* Traffic (first-party) */}
        {overview?.traffic && (
          <div className="grid md:grid-cols-3 gap-3">
            <TrafficList icon={Eye} title="Top pages (7d)" items={overview.traffic.topPaths} />
            <TrafficList icon={Globe} title="Traffic sources (7d)" items={overview.traffic.topSources} />
            <TrafficList icon={Activity} title="Devices (7d)" items={overview.traffic.devices} />
          </div>
        )}

        {/* Users table */}
        <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-zinc-100">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / username…" className="w-full bg-zinc-100 rounded-full pl-9 pr-3 py-2 text-sm outline-none" />
            </div>
            <span className="text-xs text-zinc-400 ml-auto">Users</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                    <th className="px-4 py-2 font-medium">User</th>
                    <th className="px-4 py-2 font-medium">Joined</th>
                    <th className="px-4 py-2 font-medium">Last seen</th>
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Trips</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} onClick={() => setDetailId(u._id)} className="border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center flex-shrink-0">
                            {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rose-600">{(u.name || "?").charAt(0).toUpperCase()}</span>}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-800 truncate">{u.name}</p>
                            <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{fmtDateTime(u.lastSeenAt)}</td>
                      <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap tabular-nums">{fmtMin(u.totalMinutes)}</td>
                      <td className="px-4 py-2.5 text-zinc-500 tabular-nums">{u.tripsOwned}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && !loading && (
            <button onClick={() => loadUsers(q, false)} className="w-full text-sm text-rose-500 hover:text-rose-600 font-medium py-3 border-t border-zinc-100">Load more</button>
          )}
        </div>
      </main>

      {detailId && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} navigate={navigate} />}
    </div>
  );
}
