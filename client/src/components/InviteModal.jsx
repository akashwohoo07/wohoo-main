import { useState } from "react";
import api from "../api/axios";

export default function InviteModal({ tripId, onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) { setError("Enter a valid email"); return; }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/trips/${tripId}/invite`, { email, role });
      setSuccess(`Invite sent to ${email} ✓`);
      setEmail("");
      if (onInvited) onInvited();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-900">Invite to trip</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
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

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Access level</label>
            <div className="flex gap-2">
              {["viewer", "editor"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 text-xs px-3 py-2.5 rounded-xl border transition-all ${
                    role === r ? "bg-rose-50 border-rose-300 text-rose-600 font-medium" : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
                  }`}
                >
                  <div className="text-base mb-0.5">{r === "viewer" ? "👁" : "✏️"}</div>
                  <div className="capitalize">{r}</div>
                  <div className="text-zinc-400 text-xs mt-0.5 font-normal">
                    {r === "viewer" ? "Can view only" : "Can edit trip"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-full transition-all text-sm"
          >
            {loading ? "Sending invite..." : "Send Invite & Email"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400 mt-4">
          They'll receive an email with a link to join. Invite expires in 7 days.
        </p>
      </div>
    </div>
  );
}