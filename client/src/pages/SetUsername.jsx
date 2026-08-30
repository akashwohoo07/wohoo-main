import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, PartyPopper, TriangleAlert } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SetUsername() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState(null); // null | "checking" | "available" | "taken" | "invalid" | "short"
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const debouncedUsername = useDebounce(username, 400);

  // Live availability check
  useEffect(() => {
    if (!debouncedUsername) { setStatus(null); return; }
    if (!/^[a-z0-9]+$/i.test(debouncedUsername)) { setStatus("invalid"); return; }
    if (debouncedUsername.length < 12) { setStatus("short"); return; }

    setStatus("checking");
    api.get(`/users/username/check/${debouncedUsername}`)
      .then((res) => setStatus(res.data.available ? "available" : "taken"))
      .catch(() => setStatus(null));
  }, [debouncedUsername]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status !== "available") return;
    setLoading(true);
    setError("");
    try {
      await api.post("/users/username", { username });
      setUser((prev) => ({ ...prev, username }));
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to set username");
    } finally {
      setLoading(false);
    }
  };

  const statusDisplay = () => {
    if (!username) return null;
    if (status === "checking") return <span className="text-zinc-400 text-xs">Checking...</span>;
    if (status === "short") return <span className="text-zinc-400 text-xs">Minimum 12 characters</span>;
    if (status === "invalid") return <span className="text-red-400 text-xs">Only letters and numbers allowed</span>;
    if (status === "taken") return <span className="text-red-400 text-xs flex items-center gap-1"><X className="w-3 h-3" /> @{username} is taken</span>;
    if (status === "available") return <span className="text-emerald-500 text-xs flex items-center gap-1"><Check className="w-3 h-3" /> @{username} is available</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-rose-500 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Choose your username</h1>
          <p className="text-zinc-400 text-sm mt-1">This is how others will find you</p>
        </div>

        {success ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <PartyPopper className="w-8 h-8 text-emerald-500 mx-auto mb-2" strokeWidth={1.5} />
            <p className="font-semibold text-zinc-800">@{username} is yours!</p>
            <p className="text-sm text-zinc-400 mt-1">A confirmation email has been sent. Redirecting...</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <div className="flex items-center border-b-2 border-zinc-200 focus-within:border-rose-400 transition-colors pb-1">
                  <span className="text-zinc-400 text-base mr-1">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    placeholder="yourhandle"
                    maxLength={30}
                    autoFocus
                    className="flex-1 outline-none text-zinc-800 text-base bg-transparent"
                  />
                </div>
                <div className="mt-2 h-4">{statusDisplay()}</div>
              </div>

              <div className="bg-zinc-50 rounded-xl p-3 space-y-1.5">
                {[
                  { rule: "At least 12 characters", pass: username.length >= 12 },
                  { rule: "Letters and numbers only", pass: /^[a-z0-9]+$/i.test(username) && username.length > 0 },
                  { rule: "Unique — no one else has it", pass: status === "available" },
                ].map((r) => (
                  <div key={r.rule} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${r.pass ? "bg-emerald-100" : "bg-zinc-200"}`}>
                      {r.pass && <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className={`text-xs ${r.pass ? "text-emerald-600" : "text-zinc-400"}`}>{r.rule}</span>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" /> <span>Once set, you can only change your username after <strong>30 days</strong>.</span>
                </p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={status !== "available" || loading}
                className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-full transition-all"
              >
                {loading ? "Setting username..." : "Claim @" + (username || "username")}
              </button>
            </form>

            <button
              onClick={() => navigate("/dashboard")}
              className="w-full text-sm text-zinc-400 hover:text-zinc-600 py-3 mt-2 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {user?.usernameSetAt && (
          <p className="text-center text-xs text-zinc-400 mt-4">
            Last changed: {new Date(user.usernameSetAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}