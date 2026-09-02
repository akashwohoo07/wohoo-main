import { useState } from "react";
import { Check, Eye, Pencil, X, AtSign, Mail } from "lucide-react";
import api from "../api/axios";
import UserSearchSelect from "./UserSearchSelect";

export default function InviteModal({ tripId, onClose, onInvited }) {
  const [mode, setMode] = useState("username"); // "username" | "email"
  const [role, setRole] = useState("viewer");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [invitedIds, setInvitedIds] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const invite = async (payload) => {
    setError("");
    setSuccess("");
    await api.post(`/trips/${tripId}/invite`, { ...payload, role });
    if (onInvited) onInvited();
  };

  const inviteUsername = async (user) => {
    setBusyId(user._id);
    try {
      await invite({ username: user.username });
      setInvitedIds((prev) => [...prev, user._id]);
      setSuccess(`Invite sent to @${user.username}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send invite");
    } finally {
      setBusyId(null);
    }
  };

  const inviteEmail = async (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) { setError("Enter a valid email"); return; }
    setLoading(true);
    try {
      await invite({ email });
      setSuccess(`Invite sent to ${email}`);
      setEmail("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-900">Invite to trip</h3>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access level (applies to whoever you invite) */}
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Access level</label>
        <div className="flex gap-2 mb-5">
          {["viewer", "editor"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 text-xs px-3 py-2.5 rounded-xl border transition-all ${
                role === r ? "bg-rose-50 border-rose-300 text-rose-600 font-medium" : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
              }`}
            >
              <div className="flex justify-center mb-0.5">{r === "viewer" ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}</div>
              <div className="capitalize">{r}</div>
              <div className="text-zinc-400 text-xs mt-0.5 font-normal">{r === "viewer" ? "Can view only" : "Can edit trip"}</div>
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 rounded-xl p-1 mb-4">
          <button
            onClick={() => { setMode("username"); setError(""); setSuccess(""); }}
            className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors ${mode === "username" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500"}`}
          >
            <AtSign className="w-4 h-4" /> Username
          </button>
          <button
            onClick={() => { setMode("email"); setError(""); setSuccess(""); }}
            className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors ${mode === "email" ? "bg-white text-rose-600 shadow-sm" : "text-zinc-500"}`}
          >
            <Mail className="w-4 h-4" /> Email
          </button>
        </div>

        {mode === "username" ? (
          <UserSearchSelect
            actionLabel="Invite"
            onSelect={inviteUsername}
            busyId={busyId}
            disabledIds={invitedIds}
            placeholder="Search people by username…"
          />
        ) : (
          <form onSubmit={inviteEmail} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                autoFocus
                className="w-full border-b-2 border-zinc-200 focus:border-rose-400 outline-none py-2.5 text-zinc-800 text-sm transition-colors bg-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-full transition-all text-sm"
            >
              {loading ? "Sending invite…" : "Send Invite & Email"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        {success && <p className="text-sm text-emerald-600 mt-3 flex items-center gap-1.5"><Check className="w-4 h-4 flex-shrink-0" /> <span>{success}</span></p>}

        <p className="text-center text-xs text-zinc-400 mt-4">
          Invitees get a website notification (if they have an account) and an email. Invites expire in 7 days.
        </p>
      </div>
    </div>
  );
}
