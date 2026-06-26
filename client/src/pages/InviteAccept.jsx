import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | ready | accepting | success | error
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch invite details by token
    api.get(`/trips/invitations/${token}`)
      .then((res) => { setInvite(res.data.invite); setStatus("ready"); })
      .catch((err) => {
        setError(err.response?.data?.message || "Invitation not found or expired.");
        setStatus("error");
      });
  }, [token]);

  const respond = async (action) => {
    setStatus("accepting");
    try {
      await api.post(`/trips/invitations/${token}/respond`, { action });
      if (action === "accept") {
        setStatus("success");
        setTimeout(() => navigate(`/trips/${invite.trip._id}`), 2000);
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to respond to invitation.");
      setStatus("error");
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : null;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-4xl">😕</div>
        <p className="text-zinc-600 font-medium text-center">{error}</p>
        <button onClick={() => navigate("/dashboard")} className="text-sm text-rose-500 hover:text-rose-600 transition-colors">
          ← Go to Dashboard
        </button>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-bold text-zinc-900">You're in!</h2>
        <p className="text-zinc-400 text-sm">Redirecting to the trip...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-rose-500 rounded-2xl mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">You're invited!</h1>
          <p className="text-zinc-400 text-sm mt-1">
            <span className="font-medium text-zinc-600">{invite?.invitedBy?.name}</span> invited you to join a trip
          </p>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl shadow-lg overflow-hidden mb-5">
          {invite?.trip?.coverPhoto && (
            <img src={invite.trip.coverPhoto} alt={invite.trip.name} className="w-full h-36 object-cover" />
          )}
          <div className="p-5">
            <h2 className="font-bold text-zinc-900 text-lg">{invite?.trip?.name}</h2>
            {invite?.trip?.destination?.fullLabel || invite?.trip?.destination?.name ? (
              <p className="text-sm text-zinc-400 mt-1">
                📍 {invite.trip.destination?.fullLabel || invite.trip.destination?.name}
              </p>
            ) : null}
            {invite?.trip?.startDate && (
              <p className="text-sm text-zinc-400 mt-0.5">
                📅 {formatDate(invite.trip.startDate)}
                {invite.trip.endDate ? ` — ${formatDate(invite.trip.endDate)}` : ""}
              </p>
            )}
            <div className="mt-3 inline-flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1">
              <span className="text-xs text-zinc-500">Your access:</span>
              <span className="text-xs font-semibold text-zinc-800 capitalize">{invite?.role}</span>
              <span className="text-xs text-zinc-400">{invite?.role === "editor" ? "✏️" : "👁"}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => respond("decline")}
            disabled={status === "accepting"}
            className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-3 rounded-full transition-all disabled:opacity-50"
          >
            Decline
          </button>
          <button
            onClick={() => respond("accept")}
            disabled={status === "accepting"}
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium py-3 rounded-full transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === "accepting" ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Joining...</>
            ) : "Accept & Join"}
          </button>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-4">
          Invitation expires {invite?.expiresAt ? formatDate(invite.expiresAt) : "in 7 days"}
        </p>
      </div>
    </div>
  );
}