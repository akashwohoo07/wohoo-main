import { useState, useEffect, useCallback } from "react";
import { Check, Eye, Pencil, X, AtSign, Mail, Trash2, Loader2, Crown } from "lucide-react";
import api from "../api/axios";
import UserSearchSelect from "./UserSearchSelect";

function initials(name) { return (name || "?").trim().charAt(0).toUpperCase(); }

export default function InviteModal({ tripId, onClose, onInvited }) {
  const [mode, setMode] = useState("username"); // "username" | "email"
  const [role, setRole] = useState("viewer");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [invitedIds, setInvitedIds] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Current collaborators + pending invites (managed inline).
  const [collab, setCollab] = useState({ members: [], invites: [], myRole: null });
  const isOwner = collab.myRole === "owner";

  const loadCollab = useCallback(async () => {
    try {
      const { data } = await api.get(`/trips/${tripId}/collaborators`);
      setCollab({ members: data.members || [], invites: data.invites || [], myRole: data.myRole || null });
    } catch { /* ignore — modal still works for inviting */ }
  }, [tripId]);

  useEffect(() => { loadCollab(); }, [loadCollab]);

  const changeRole = async (userId, newRole) => {
    setBusyId(userId);
    try { await api.patch(`/trips/${tripId}/members/${userId}`, { role: newRole }); await loadCollab(); }
    catch (err) { setError(err.response?.data?.message || "Could not change role"); }
    finally { setBusyId(null); }
  };
  const removeMember = async (userId) => {
    if (!confirm("Remove this person from the trip?")) return;
    setBusyId(userId);
    try { await api.delete(`/trips/${tripId}/members/${userId}`); await loadCollab(); if (onInvited) onInvited(); }
    catch (err) { setError(err.response?.data?.message || "Could not remove member"); }
    finally { setBusyId(null); }
  };
  const cancelInvite = async (invId) => {
    setBusyId(invId);
    try { await api.delete(`/trips/${tripId}/invitations/${invId}`); await loadCollab(); }
    catch (err) { setError(err.response?.data?.message || "Could not cancel invite"); }
    finally { setBusyId(null); }
  };

  const invite = async (payload) => {
    setError("");
    setSuccess("");
    await api.post(`/trips/${tripId}/invite`, { ...payload, role });
    if (onInvited) onInvited();
    loadCollab();
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

        {/* People with access — manage current members + pending invites */}
        {(collab.members.length > 0 || collab.invites.length > 0) && (
          <div className="mb-5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">People with access</label>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {collab.members.map((m) => (
                <div key={m.user?._id} className="flex items-center gap-2.5 py-1.5">
                  {m.user?.avatar
                    ? <img src={m.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">{initials(m.user?.name)}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-800 truncate flex items-center gap-1">
                      {m.user?.name || m.user?.email || "Member"}
                      {m.isOwner && <Crown className="w-3 h-3 text-amber-500" />}
                    </p>
                    {m.user?.username && <p className="text-[11px] text-zinc-400 truncate">@{m.user.username}</p>}
                  </div>
                  {m.isOwner ? (
                    <span className="text-[11px] font-medium text-zinc-400 px-2">Owner</span>
                  ) : isOwner ? (
                    <>
                      <select
                        value={m.role}
                        disabled={busyId === m.user?._id}
                        onChange={(e) => changeRole(m.user._id, e.target.value)}
                        className="text-xs border border-zinc-200 rounded-lg px-1.5 py-1 text-zinc-600 outline-none focus:border-rose-400 bg-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button onClick={() => removeMember(m.user._id)} disabled={busyId === m.user?._id} title="Remove" className="text-zinc-300 hover:text-rose-500 flex-shrink-0">
                        {busyId === m.user?._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-400 px-2 capitalize">{m.role}</span>
                  )}
                </div>
              ))}
              {collab.invites.map((i) => (
                <div key={i._id} className="flex items-center gap-2.5 py-1.5 opacity-80">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center flex-shrink-0"><Mail className="w-3.5 h-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-600 truncate">{i.user?.name || i.email}</p>
                    <p className="text-[11px] text-amber-500">Pending · {i.role}</p>
                  </div>
                  {(isOwner || true) && (
                    <button onClick={() => cancelInvite(i._id)} disabled={busyId === i._id} title="Cancel invite" className="text-zinc-300 hover:text-rose-500 flex-shrink-0">
                      {busyId === i._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
