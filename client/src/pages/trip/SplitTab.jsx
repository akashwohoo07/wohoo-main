import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Receipt, Scale, X, Trash2, ChevronRight, ArrowLeft, Users, Wallet, TrendingUp, TrendingDown, Loader2,
} from "lucide-react";
import api from "../../api/axios";

// ── money helpers ─────────────────────────────────────────────
const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const memberId = (m) => (m.user?._id || m.user || "").toString();
const memberUser = (m) => m.user || {};
// Robust display name — never render a blank row even if `user` wasn't populated.
const memberName = (m) => memberUser(m).name || memberUser(m).email || "Member";
const roleTag = (m) => (m.role ? m.role[0].toUpperCase() + m.role.slice(1) : "Member");
const initials = (name = "?") => name.trim().charAt(0).toUpperCase() || "?";

function Avatar({ user, size = 36 }) {
  const style = { width: size, height: size };
  if (user?.avatar) {
    return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover" />;
  }
  return (
    <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
      {initials(user?.name)}
    </div>
  );
}

const SPLIT_OPTIONS = [
  { id: "equal", label: "Equally" },
  { id: "exact", label: "Exact ₹" },
  { id: "percentage", label: "Percent %" },
  { id: "shares", label: "Shares" },
];

// ── Add / Edit expense modal ──────────────────────────────────
function ExpenseModal({ trip, currentUser, onClose, onSaved }) {
  const members = trip.members || [];
  const myId = (currentUser?._id || currentUser?.id || "").toString();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(myId || memberId(members[0] || {}));
  const [method, setMethod] = useState("equal");
  const [selected, setSelected] = useState(() => new Set(members.map(memberId)));
  const [values, setValues] = useState({}); // userId -> raw input for exact/%/shares
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const amountNum = round2(parseFloat(amount) || 0);
  const chosen = members.filter((m) => selected.has(memberId(m)));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Live preview of what each selected member owes, mirroring the server logic.
  const preview = useMemo(() => {
    const ids = chosen.map(memberId);
    if (!ids.length || amountNum <= 0) return { owed: {}, valid: false, hint: "" };

    const totalPaise = Math.round(amountNum * 100);
    const owed = {};

    if (method === "equal") {
      const base = Math.floor(totalPaise / ids.length);
      let rem = totalPaise - base * ids.length;
      ids.forEach((id, i) => (owed[id] = (base + (i < rem ? 1 : 0)) / 100));
      return { owed, valid: true, hint: "" };
    }
    if (method === "exact") {
      const sum = ids.reduce((a, id) => a + (parseFloat(values[id]) || 0), 0);
      ids.forEach((id) => (owed[id] = round2(parseFloat(values[id]) || 0)));
      const diff = round2(amountNum - sum);
      return {
        owed,
        valid: Math.abs(diff) < 0.005,
        hint: diff === 0 ? "" : diff > 0 ? `${fmt(diff)} left` : `${fmt(-diff)} over`,
      };
    }
    if (method === "percentage") {
      const sum = ids.reduce((a, id) => a + (parseFloat(values[id]) || 0), 0);
      ids.forEach((id) => (owed[id] = round2((amountNum * (parseFloat(values[id]) || 0)) / 100)));
      const diff = round2(100 - sum);
      return { owed, valid: Math.abs(diff) < 0.01, hint: diff === 0 ? "" : `${diff > 0 ? diff : -diff}% ${diff > 0 ? "left" : "over"}` };
    }
    // shares
    const totalShares = ids.reduce((a, id) => a + (parseFloat(values[id]) || 0), 0);
    if (totalShares <= 0) return { owed: {}, valid: false, hint: "Assign at least one share" };
    ids.forEach((id) => (owed[id] = round2((amountNum * (parseFloat(values[id]) || 0)) / totalShares)));
    return { owed, valid: true, hint: "" };
  }, [chosen, amountNum, method, values]);

  const canSave = title.trim() && amountNum > 0 && chosen.length > 0 && preview.valid && !saving;

  const submit = async () => {
    setError("");
    if (!canSave) return;
    setSaving(true);
    try {
      const participants = chosen.map((m) => {
        const id = memberId(m);
        const p = { user: id };
        if (method === "exact" || method === "percentage" || method === "shares") {
          p.value = parseFloat(values[id]) || 0;
        }
        return p;
      });
      const { data } = await api.post(`/trips/${trip._id}/expenses`, {
        title: title.trim(),
        description: description.trim(),
        amount: amountNum,
        paidBy,
        splitMethod: method,
        participants,
      });
      onSaved(data.expense);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save expense.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-shrink-0">
          <h3 className="text-lg font-semibold text-zinc-900">Add an expense</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dinner, cab, hotel…"
              autoFocus
              maxLength={200}
              className="w-full mt-1.5 border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2 text-zinc-800 bg-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Description <span className="text-zinc-300 normal-case font-normal">· optional</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a note (who, where, details)…"
              rows={2}
              maxLength={1000}
              className="w-full mt-1.5 border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-700 outline-none focus:border-rose-400 resize-none bg-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Amount (₹)</label>
            <input
              type="number" inputMode="decimal" min="0" step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full mt-1.5 border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2 text-2xl font-semibold text-zinc-900 bg-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Paid by</label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full mt-1.5 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-rose-400 bg-white"
            >
              {members.map((m) => (
                <option key={memberId(m)} value={memberId(m)}>
                  {memberName(m)}{memberId(m) === myId ? " (you)" : ""} · {roleTag(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Split</label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 bg-zinc-100 rounded-xl p-1">
              {SPLIT_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setMethod(o.id)}
                  className={`text-xs font-medium py-2 rounded-lg transition-colors ${method === o.id ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Split between</label>
              {preview.hint && (
                <span className={`text-xs font-medium ${preview.valid ? "text-emerald-500" : "text-rose-500"}`}>{preview.hint}</span>
              )}
            </div>
            <div className="space-y-1">
              {members.map((m) => {
                const id = memberId(m);
                const on = selected.has(id);
                return (
                  <div key={id} className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-colors ${on ? "bg-zinc-50" : "opacity-50"}`}>
                    <button onClick={() => toggle(id)} className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? "bg-rose-500 border-rose-500" : "border-zinc-300"}`}>
                        {on && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <Avatar user={memberUser(m)} size={30} />
                      <span className="text-sm text-zinc-700 truncate">{memberName(m)}{id === myId ? " (you)" : ""}</span>
                      <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 rounded-full px-1.5 py-0.5 flex-shrink-0">{roleTag(m)}</span>
                    </button>

                    {on && method === "equal" && (
                      <span className="text-sm text-zinc-500 tabular-nums">{fmt(preview.owed[id])}</span>
                    )}
                    {on && method !== "equal" && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number" inputMode="decimal" min="0" step={method === "shares" ? "1" : "0.01"}
                          value={values[id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
                          placeholder={method === "percentage" ? "%" : method === "shares" ? "sh" : "0.00"}
                          className="w-20 border border-zinc-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:border-rose-400 tabular-nums"
                        />
                        {method !== "shares" && (
                          <span className="text-xs text-zinc-400 w-12 text-right tabular-nums">{fmt(preview.owed[id])}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-zinc-100 flex-shrink-0">
          <button
            onClick={submit}
            disabled={!canSave}
            className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-full transition-all flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save expense
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Per-member drill-down ─────────────────────────────────────
function MemberDetail({ trip, member, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const u = member.user;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/trips/${trip._id}/expenses/user/${u._id}`)
      .then(({ data }) => { if (alive) setItems(data.items); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [trip._id, u._id]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-zinc-100 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
        <Avatar user={u} size={34} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 truncate">{u.name}</p>
          <p className={`text-xs font-medium ${member.net > 0 ? "text-emerald-500" : member.net < 0 ? "text-rose-500" : "text-zinc-400"}`}>
            {member.net > 0 ? `gets back ${fmt(member.net)}` : member.net < 0 ? `owes ${fmt(-member.net)}` : "settled up"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-10">No expenses involving this member yet.</p>
        ) : (
          items.map((it) => (
            <div key={it._id} className="flex items-center gap-3 bg-white border border-zinc-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{it.title}</p>
                <p className="text-xs text-zinc-400">
                  {it.youPaid > 0 ? `paid ${fmt(it.youPaid)}` : `paid by ${it.paidBy?.name}`} · total {fmt(it.amount)}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold tabular-nums ${it.net > 0 ? "text-emerald-500" : it.net < 0 ? "text-rose-500" : "text-zinc-400"}`}>
                  {it.net > 0 ? `+${fmt(it.net)}` : it.net < 0 ? `-${fmt(-it.net)}` : fmt(0)}
                </p>
                <p className="text-[11px] text-zinc-400">share {fmt(it.yourShare)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────
export default function SplitTab({ trip, canEdit, isMember, currentUser }) {
  const [view, setView] = useState("expenses"); // "expenses" | "balances"
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState(null); // { total, balances, settlements }
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailMember, setDetailMember] = useState(null);

  const memberName = useCallback(
    (id) => memberUser((trip.members || []).find((m) => memberId(m) === String(id)) || {}).name || "Someone",
    [trip.members]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ex, bal] = await Promise.all([
        api.get(`/trips/${trip._id}/expenses`),
        api.get(`/trips/${trip._id}/expenses/balances`),
      ]);
      setExpenses(ex.data.expenses);
      setBalances(bal.data);
    } catch {
      // leave empty on error
    } finally {
      setLoading(false);
    }
  }, [trip._id]);

  useEffect(() => { if (isMember) load(); }, [isMember, load]);

  const removeExpense = async (id) => {
    setExpenses((prev) => prev.filter((e) => e._id !== id));
    try {
      await api.delete(`/trips/${trip._id}/expenses/${id}`);
      const bal = await api.get(`/trips/${trip._id}/expenses/balances`);
      setBalances(bal.data);
    } catch {
      load(); // resync on failure
    }
  };

  const onSaved = () => { setShowModal(false); load(); };

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-3 text-center px-8">
        <Wallet className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Expenses are private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view expenses & splits.</p>
      </div>
    );
  }

  if (detailMember) {
    return (
      <div className="w-full">
        <MemberDetail trip={trip} member={detailMember} onBack={() => setDetailMember(null)} />
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col h-full">
      {/* Sub-tabs + add */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-zinc-100 flex-shrink-0">
        <div className="flex gap-1 bg-zinc-100 rounded-full p-1">
          <button
            onClick={() => setView("expenses")}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 sm:px-4 py-1.5 rounded-full transition-colors ${view === "expenses" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            <Receipt className="w-4 h-4" /> Expenses
          </button>
          <button
            onClick={() => setView("balances")}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 sm:px-4 py-1.5 rounded-full transition-colors ${view === "balances" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            <Scale className="w-4 h-4" /> Splits
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {balances && balances.total > 0 && (
            <div className="text-right hidden md:block">
              <p className="text-[11px] text-zinc-400 uppercase tracking-wider leading-none">Trip total</p>
              <p className="text-sm font-semibold text-zinc-900 tabular-nums">{fmt(balances.total)}</p>
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium pl-3 pr-4 py-2 rounded-full shadow-sm active:scale-95 transition-all flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add expense</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>
        ) : view === "expenses" ? (
          <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-2">
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
                <Receipt className="w-12 h-12 text-zinc-200" strokeWidth={1.5} />
                <h3 className="font-semibold text-zinc-700">No expenses yet</h3>
                <p className="text-sm text-zinc-400">Add your first shared cost to start splitting.</p>
              </div>
            ) : (
              expenses.map((e) => (
                <div key={e._id} className="group flex items-center gap-3 bg-white border border-zinc-100 rounded-xl px-4 py-3 hover:border-zinc-200 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{e.title}</p>
                    {e.description && (
                      <p className="text-xs text-zinc-500 truncate">{e.description}</p>
                    )}
                    <p className="text-xs text-zinc-400 truncate">
                      {e.paidBy?.name || memberName(e.paidBy)} paid · split {e.splitMethod} between {e.participants.length}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 tabular-nums flex-shrink-0">{fmt(e.amount)}</p>
                  {canEdit && (
                    <button
                      onClick={() => removeExpense(e._id)}
                      className="p-1.5 rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Balances list */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Balances</h4>
              {balances?.balances.map((b) => (
                <button
                  key={b.user._id}
                  onClick={() => setDetailMember(b)}
                  className="w-full flex items-center gap-3 bg-white border border-zinc-100 rounded-xl px-4 py-3 hover:border-zinc-200 transition-colors text-left"
                >
                  <Avatar user={b.user} size={38} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{b.user.name}</p>
                    <p className="text-xs text-zinc-400">paid {fmt(b.paid)} · share {fmt(b.owed)}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className={`text-sm font-semibold tabular-nums ${b.net > 0 ? "text-emerald-500" : b.net < 0 ? "text-rose-500" : "text-zinc-400"}`}>
                        {b.net > 0 ? `+${fmt(b.net)}` : b.net < 0 ? `-${fmt(-b.net)}` : fmt(0)}
                      </p>
                      <p className="text-[11px] text-zinc-400 flex items-center justify-end gap-0.5">
                        {b.net > 0 ? (<><TrendingUp className="w-3 h-3" /> gets back</>) : b.net < 0 ? (<><TrendingDown className="w-3 h-3" /> owes</>) : "settled"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300" />
                  </div>
                </button>
              ))}
            </div>

            {/* Settlement suggestions */}
            {balances?.settlements?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Suggested settlements</h4>
                {balances.settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-zinc-50 rounded-xl px-4 py-3 text-sm">
                    <span className="font-medium text-zinc-800">{memberName(s.from)}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                    <span className="font-medium text-zinc-800">{memberName(s.to)}</span>
                    <span className="ml-auto font-semibold text-zinc-900 tabular-nums">{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <ExpenseModal trip={trip} currentUser={currentUser} onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
    </div>
  );
}
