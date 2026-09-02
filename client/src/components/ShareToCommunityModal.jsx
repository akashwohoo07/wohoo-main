import { useState, useEffect } from "react";
import { X, Hash, Lock, Loader2, Check, Send, Users } from "lucide-react";
import api from "../api/axios";

// Share a trip into one of the communities the user belongs to.
export default function ShareToCommunityModal({ trip, onClose }) {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [doneIds, setDoneIds] = useState([]);

  useEffect(() => {
    api.get("/communities/mine")
      .then(({ data }) => setCommunities(data.communities || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const share = async (c) => {
    setSendingId(c._id);
    try {
      await api.post(`/communities/${c._id}/messages`, { type: "trip_share", tripId: trip._id, text: note.trim() });
      setDoneIds((prev) => [...prev, c._id]);
    } catch { /* ignore */ } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900">Share trip to a community</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3 bg-zinc-50 rounded-xl p-2.5 mb-4">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gradient-to-br from-rose-100 to-blue-100 flex-shrink-0">
            {trip.coverPhoto && <img src={trip.coverPhoto} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800 truncate">{trip.name}</p>
            <p className="text-xs text-zinc-400 truncate">{trip.destination?.fullLabel || trip.destination?.name}</p>
          </div>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)…"
          className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-400 mb-4"
        />

        <div className="overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
          ) : communities.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">Join or create a community first to share trips.</p>
          ) : (
            communities.map((c) => {
              const done = doneIds.includes(c._id);
              return (
                <div key={c._id} className="flex items-center gap-3 border border-zinc-100 rounded-xl p-2.5">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{c.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate inline-flex items-center gap-1">
                      {c.type === "private" ? <Lock className="w-3 h-3 text-zinc-400" /> : <Hash className="w-3 h-3 text-zinc-400" />}{c.name}
                    </p>
                    <p className="text-xs text-zinc-400 flex items-center gap-1"><Users className="w-3 h-3" /> {c.membersCount}</p>
                  </div>
                  <button
                    onClick={() => !done && share(c)}
                    disabled={done || sendingId === c._id}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1 flex-shrink-0 ${done ? "bg-emerald-50 text-emerald-600" : "bg-rose-500 hover:bg-rose-600 text-white"}`}
                  >
                    {sendingId === c._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done ? <><Check className="w-3.5 h-3.5" /> Shared</> : <><Send className="w-3.5 h-3.5" /> Share</>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
