import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, Compass, Heart } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function PrivacySwitch({ isPublic, toggling, onToggle }) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      title={isPublic ? "Click to make private" : "Click to make public"}
      className="flex items-center gap-2 select-none"
    >
      <span className={`text-xs font-medium transition-colors ${isPublic ? "text-emerald-600" : "text-zinc-400"}`}>
        {isPublic ? "Public" : "Private"}
      </span>
      {/* Switch track */}
      <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${isPublic ? "bg-emerald-500" : "bg-zinc-300"} ${toggling ? "opacity-50" : ""}`}>
        {/* Switch thumb */}
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 flex items-center justify-center ${isPublic ? "translate-x-4" : "translate-x-0"}`}>
          {toggling ? (
            <div className="w-2.5 h-2.5 border border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
          ) : isPublic ? (
            <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064" />
            </svg>
          ) : (
            <svg className="w-2.5 h-2.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

function TripCard({ trip, currentUserId }) {
  const navigate = useNavigate();
  const [isPublic, setIsPublic] = useState(trip.isPublic || false);
  const [toggling, setToggling] = useState(false);

  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const formatRange = (s, e) => {
    if (!s) return null;
    const start = new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    if (!e) return start;
    const days = Math.ceil((new Date(e) - new Date(s)) / (1000 * 60 * 60 * 24)) + 1;
    return `${start} · ${days} days`;
  };

  const isOwner =
    trip.owner?._id === currentUserId ||
    trip.owner === currentUserId ||
    trip.members?.some((m) => m.role === "owner" && (m.user?._id === currentUserId || m.user === currentUserId));

  const handleTogglePrivacy = async (e) => {
    e.stopPropagation();
    setToggling(true);
    try {
      const res = await api.patch(`/trips/${trip._id}/privacy`);
      setIsPublic(res.data.isPublic);
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      onClick={() => navigate(`/trips/${trip._id}`)}
      className="bg-white rounded-2xl border border-zinc-100 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
    >
      {/* Cover image */}
      <div className="h-44 bg-gradient-to-br from-zinc-200 to-zinc-300 relative overflow-hidden">
        {trip.coverPhoto ? (
          <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064" />
            </svg>
          </div>
        )}

        {/* Member avatars — bottom left */}
        <div className="absolute bottom-3 left-3 flex -space-x-1">
          {trip.members?.slice(0, 3).map((m, i) => (
            <div
              key={i}
              className="w-7 h-7 rounded-full border-2 border-white bg-rose-200 flex items-center justify-center"
              style={{ zIndex: trip.members.length - i }}
            >
              {m.user?.avatar ? (
                <img src={m.user.avatar} className="w-full h-full rounded-full object-cover" alt="" />
              ) : (
                <span className="text-xs font-bold text-rose-600">{initials(m.user?.name || "?")}</span>
              )}
            </div>
          ))}
          {trip.members?.length > 3 && (
            <div className="w-7 h-7 rounded-full border-2 border-white bg-zinc-100 flex items-center justify-center">
              <span className="text-xs text-zinc-500">+{trip.members.length - 3}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-800 text-sm truncate">{trip.name}</p>
            {trip.destination?.name && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{trip.destination.fullLabel || trip.destination.name}</p>
            )}
            {(trip.startDate || trip.endDate) && (
              <p className="text-xs text-zinc-400 mt-0.5">{formatRange(trip.startDate, trip.endDate)}</p>
            )}
          </div>

          {/* Switch at bottom right — owner only */}
          {isOwner && (
            <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 mt-0.5">
              <PrivacySwitch
                isPublic={isPublic}
                toggling={toggling}
                onToggle={handleTogglePrivacy}
              />
            </div>
          )}

          {/* Non-owner: static badge */}
          {!isOwner && (
            <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
              isPublic ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
            }`}>
              {isPublic ? "Public" : "Private"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteCard({ invite, onRespond }) {
  const [loading, setLoading] = useState(false);
  const respond = async (action) => {
    setLoading(true);
    try {
      await api.post(`/trips/invitations/${invite.token}/respond`, { action });
      onRespond(invite._id, action);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-rose-200 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 truncate">
          <span className="text-zinc-600">{invite.invitedBy?.name}</span>{" "}invited you to{" "}
          <span className="text-rose-600 font-semibold">{invite.trip?.name}</span>
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {invite.trip?.destination?.fullLabel || invite.trip?.destination?.name || ""}
          {invite.role ? ` · ${invite.role === "editor" ? "Can edit" : "View only"}` : ""}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={() => respond("decline")} disabled={loading} className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-50">Decline</button>
        <button onClick={() => respond("accept")} disabled={loading} className="text-xs px-3 py-1.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50">Accept</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tripsRes, invitesRes] = await Promise.all([
          api.get("/trips"),
          api.get("/trips/invitations"),
        ]);
        setUpcoming(tripsRes.data.upcoming || []);
        setPast(tripsRes.data.past || []);
        setInvites(invitesRes.data.invites || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const handleInviteRespond = (inviteId, action) => {
    setInvites((prev) => prev.filter((i) => i._id !== inviteId));
    if (action === "accept") {
      api.get("/trips").then((res) => {
        setUpcoming(res.data.upcoming || []);
        setPast(res.data.past || []);
      });
    }
  };

  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-zinc-100">
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Wohoo.in home"
          className="flex items-baseline leading-none hover:opacity-80 transition-opacity"
        >
          <span
            className="font-serif text-2xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent"
          >
            Wohoo
          </span>
          <span className="font-serif text-2xl font-bold tracking-tight text-zinc-900">.in</span>
        </button>

        <div className="hidden md:flex gap-8">
          {[
            { label: "Trips", icon: Plane, active: true },
            { label: "Discover", icon: Compass },
            { label: "Wishlist", icon: Heart },
          ].map((tab) => {
            const TabIcon = tab.icon;
            return (
            <button key={tab.label} className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${tab.active ? "text-rose-500 border-b-2 border-rose-500 pb-1" : "text-zinc-400 hover:text-zinc-600"}`}>
              <TabIcon className="w-4 h-4" /> {tab.label}
            </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {invites.length > 0 && (
            <div className="w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">{invites.length}</div>
          )}
          <button onClick={() => navigate("/search")} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Find people">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button
            onClick={() => user?.username ? navigate(`/u/${user.username}`) : navigate("/set-username")}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-xs font-bold text-zinc-600">{initials(user?.name)}</span>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-zinc-700 leading-tight">{user?.name?.split(" ")[0]}</p>
              {user?.username ? (
                <p className="text-xs text-zinc-400 leading-tight">@{user.username}</p>
              ) : (
                <p className="text-xs text-rose-400 leading-tight">Set username</p>
              )}
            </div>
          </button>
          <button onClick={async () => { await logout(); navigate("/login"); }} className="text-xs text-zinc-400 hover:text-rose-500 transition-colors">
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        {/* Pending invitations */}
        {invites.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Pending Invitations ({invites.length})</h2>
            <div className="space-y-3">
              {invites.map((inv) => <InviteCard key={inv._id} invite={inv} onRespond={handleInviteRespond} />)}
            </div>
          </div>
        )}

        {/* Upcoming trips */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <h2 className="text-xl sm:text-2xl font-serif text-zinc-900">Upcoming trips</h2>
          <button onClick={() => navigate("/trips/create")} className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 sm:px-5 py-2.5 rounded-full transition-all flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Create a trip</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="rounded-2xl bg-zinc-100 animate-pulse h-64" />)}
          </div>
        ) : upcoming.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcoming.map((trip) => <TripCard key={trip._id} trip={trip} currentUserId={user?._id} />)}
          </div>
        ) : (
          <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-12 text-center">
            <p className="text-zinc-400 text-sm mb-4">No upcoming trips yet</p>
            <button onClick={() => navigate("/trips/create")} className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-6 py-2.5 rounded-full transition-all">Plan your first trip</button>
          </div>
        )}

        {/* Past trips */}
        {past.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl sm:text-2xl font-serif text-zinc-900 mb-6">Past trips</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {past.map((trip) => <TripCard key={trip._id} trip={trip} currentUserId={user?._id} />)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}