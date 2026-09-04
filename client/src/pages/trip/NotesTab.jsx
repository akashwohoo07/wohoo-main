import { useState, useEffect, useCallback, useRef } from "react";
import { NotebookPen, ListChecks, Plus, Trash2, Loader2, Send, Check, Square, CheckSquare, Users, User } from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const DEFAULT_ITEMS = ["Book transport", "Book accommodation", "Plan day-by-day activities"];

function Avatar({ user, size = 32 }) {
  const style = { width: size, height: size };
  if (user?.avatar) return <img src={user.avatar} alt={user.name} style={style} className="rounded-full object-cover flex-shrink-0" />;
  return <div style={style} className="rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">{(user?.name || "?").charAt(0).toUpperCase()}</div>;
}
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d ago`;
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// ── Notes feed ────────────────────────────────────────────────
function NotesFeed({ tripId, myId, isOwner }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/trips/${tripId}/notes?limit=20`);
      setNotes(data.notes);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [tripId]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    try {
      const { data } = await api.get(`/trips/${tripId}/notes?limit=20&cursor=${encodeURIComponent(cursor)}`);
      setNotes((prev) => [...prev, ...data.notes]);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch { /* ignore */ }
  };

  const post = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setPosting(true);
    try {
      const { data } = await api.post(`/trips/${tripId}/notes`, { text: t });
      setNotes((prev) => [data.note, ...prev]);
      setText("");
    } catch { /* ignore */ } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    setNotes((prev) => prev.filter((n) => n._id !== id));
    try { await api.delete(`/trips/${tripId}/notes/${id}`); } catch { load(); }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <form onSubmit={post} className="mb-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share a note with the group…"
          rows={3}
          maxLength={4000}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-700 outline-none focus:border-rose-400 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button type="submit" disabled={posting || !text.trim()} className="inline-flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-full transition-all">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post note
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-center py-12">
          <NotebookPen className="w-10 h-10 text-zinc-200" strokeWidth={1.5} />
          <p className="text-sm text-zinc-400">No notes yet — write the first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const canDelete = String(note.author?._id) === myId || isOwner;
            return (
              <div key={note._id} className="group flex gap-3 bg-white border border-zinc-100 rounded-xl p-3">
                <Avatar user={note.author} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-800 truncate">{note.author?.name}</span>
                    <span className="text-xs text-zinc-400 truncate">@{note.author?.username}</span>
                    <span className="text-xs text-zinc-300">· {timeAgo(note.createdAt)}</span>
                  </div>
                  <p className="text-sm text-zinc-600 whitespace-pre-wrap break-words mt-0.5">{note.text}</p>
                </div>
                {canDelete && (
                  <button onClick={() => remove(note._id)} title="Delete note" className="text-zinc-300 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          {hasMore && (
            <button onClick={loadMore} className="w-full text-sm text-rose-500 hover:text-rose-600 font-medium py-2">Load older notes</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Checklists ────────────────────────────────────────────────
function ChecklistCard({ tripId, checklist, myId, isOwner, onChanged, onDeleted }) {
  const [itemText, setItemText] = useState("");
  const [busy, setBusy] = useState(false);
  const canDeleteList = String(checklist.createdBy?._id) === myId || isOwner;
  const isIndividual = checklist.scope === "individual";
  // "Done" is per-user for individual lists, shared for common lists.
  const itemDone = (item) =>
    isIndividual ? (item.checkedBy || []).some((id) => String(id) === myId) : !!item.done;
  const done = checklist.items.filter(itemDone).length;

  // Optimistic toggle: flip the checkbox instantly, then persist in the
  // background and revert if the request fails (removes the ~0.5s lag).
  const toggle = (item) => {
    const next = !itemDone(item);
    const optimistic = {
      ...checklist,
      items: checklist.items.map((i) => {
        if (i._id !== item._id) return i;
        if (isIndividual) {
          const arr = (i.checkedBy || []).map(String);
          return { ...i, checkedBy: next ? [...arr, myId] : arr.filter((x) => x !== myId) };
        }
        return { ...i, done: next };
      }),
    };
    onChanged(optimistic);
    api
      .patch(`/trips/${tripId}/checklists/${checklist._id}/items/${item._id}`, { done: next })
      .then(({ data }) => onChanged(data.checklist))
      .catch(() => onChanged(checklist)); // revert on failure
  };
  const addItem = async (e) => {
    e?.preventDefault();
    const t = itemText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/trips/${tripId}/checklists/${checklist._id}/items`, { text: t });
      onChanged(data.checklist);
      setItemText("");
    } catch { /* ignore */ } finally { setBusy(false); }
  };
  const deleteItem = async (item) => {
    try {
      const { data } = await api.delete(`/trips/${tripId}/checklists/${checklist._id}/items/${item._id}`);
      onChanged(data.checklist);
    } catch { /* ignore */ }
  };
  const deleteList = async () => {
    if (!confirm(`Delete checklist "${checklist.title}"?`)) return;
    try { await api.delete(`/trips/${tripId}/checklists/${checklist._id}`); onDeleted(checklist._id); } catch { /* ignore */ }
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-800 truncate">{checklist.title}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isIndividual ? "bg-violet-50 text-violet-600" : "bg-sky-50 text-sky-600"}`}>
              {isIndividual ? <><User className="w-2.5 h-2.5" /> Personal</> : <><Users className="w-2.5 h-2.5" /> Shared</>}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">{done}/{checklist.items.length} done{isIndividual ? " (yours)" : ""} · by @{checklist.createdBy?.username}</p>
        </div>
        {canDeleteList && (
          <button onClick={deleteList} title="Delete checklist" className="text-zinc-300 hover:text-rose-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>

      <div className="space-y-1">
        {checklist.items.map((item) => {
          const mine = itemDone(item);
          const others = isIndividual ? (item.checkedBy || []).length : 0;
          return (
          <div key={item._id} className="group flex items-center gap-2.5 py-1">
            <button onClick={() => toggle(item)} className="flex-shrink-0 text-zinc-400 hover:text-rose-500">
              {mine ? <CheckSquare className="w-5 h-5 text-rose-500" /> : <Square className="w-5 h-5" />}
            </button>
            <span className={`flex-1 text-sm ${mine ? "line-through text-zinc-300" : "text-zinc-700"}`}>{item.text}</span>
            {isIndividual && others > 0 && (
              <span className="text-[10px] text-zinc-400 flex-shrink-0" title={`${others} member(s) checked this`}>{others} ✓</span>
            )}
            <button onClick={() => deleteItem(item)} className="text-zinc-300 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          );
        })}
      </div>

      <form onSubmit={addItem} className="flex items-center gap-2 mt-3">
        <input value={itemText} onChange={(e) => setItemText(e.target.value)} placeholder="Add an item…" className="flex-1 border-b border-zinc-200 focus:border-rose-400 outline-none py-1.5 text-sm bg-transparent" />
        <button type="submit" disabled={busy || !itemText.trim()} className="text-zinc-400 hover:text-rose-500 disabled:opacity-40 flex-shrink-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}

function Checklists({ tripId, myId, isOwner }) {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newScope, setNewScope] = useState("common");
  const [creating, setCreating] = useState(false);
  const seededRef = useRef(false);

  const create = useCallback(async (title, items, scope = "common") => {
    const { data } = await api.post(`/trips/${tripId}/checklists`, { title, items, scope });
    setChecklists((prev) => [...prev, data.checklist]);
    return data.checklist;
  }, [tripId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/trips/${tripId}/checklists`);
        if (!alive) return;
        if (data.checklists.length === 0 && !seededRef.current) {
          // Seed a default checklist with 3 starter items on first visit.
          seededRef.current = true;
          await create("Trip checklist", DEFAULT_ITEMS);
        } else {
          setChecklists(data.checklists);
        }
      } catch { /* ignore */ } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tripId, create]);

  const onChanged = (updated) => setChecklists((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
  const onDeleted = (id) => setChecklists((prev) => prev.filter((c) => c._id !== id));

  const addChecklist = async (e) => {
    e?.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    setCreating(true);
    try { await create(t, [], newScope); setNewTitle(""); setNewScope("common"); } catch { /* ignore */ } finally { setCreating(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      {checklists.map((c) => (
        <ChecklistCard key={c._id} tripId={tripId} checklist={c} myId={myId} isOwner={isOwner} onChanged={onChanged} onDeleted={onDeleted} />
      ))}

      <form onSubmit={addChecklist} className="bg-white border border-dashed border-zinc-200 rounded-2xl px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New checklist name…" className="flex-1 outline-none text-sm bg-transparent" />
          <button type="submit" disabled={creating || !newTitle.trim()} className="inline-flex items-center gap-1 text-sm font-medium text-rose-500 hover:text-rose-600 disabled:opacity-40 flex-shrink-0">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>
        <div className="flex items-center gap-1.5 pl-6">
          <button type="button" onClick={() => setNewScope("common")} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${newScope === "common" ? "bg-sky-50 border-sky-200 text-sky-600" : "border-zinc-200 text-zinc-400 hover:text-zinc-600"}`}>
            <Users className="w-3 h-3" /> Shared
          </button>
          <button type="button" onClick={() => setNewScope("individual")} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${newScope === "individual" ? "bg-violet-50 border-violet-200 text-violet-600" : "border-zinc-200 text-zinc-400 hover:text-zinc-600"}`}>
            <User className="w-3 h-3" /> Personal
          </button>
          <span className="text-[10px] text-zinc-400 ml-1">{newScope === "individual" ? "Everyone ticks their own (e.g. raincoat)" : "One shared tick (e.g. book tickets)"}</span>
        </div>
      </form>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────
export function NotesTab({ trip, isMember }) {
  const { user } = useAuth();
  const myId = String(user?._id || user?.id || "");
  const ownerId = String(trip.owner?._id || trip.owner || "");
  const isOwner = myId === ownerId;
  const [view, setView] = useState("notes"); // "notes" | "checklists"

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-3 text-center px-8">
        <NotebookPen className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Notes are private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view notes.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-zinc-100 flex-shrink-0">
        <div className="flex gap-1 bg-zinc-100 rounded-full p-1">
          <button onClick={() => setView("notes")} className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${view === "notes" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
            <NotebookPen className="w-4 h-4" /> Notes
          </button>
          <button onClick={() => setView("checklists")} className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${view === "checklists" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
            <ListChecks className="w-4 h-4" /> Checklists
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === "notes"
          ? <NotesFeed tripId={trip._id} myId={myId} isOwner={isOwner} />
          : <Checklists tripId={trip._id} myId={myId} isOwner={isOwner} />}
      </div>
    </div>
  );
}

export default NotesTab;
