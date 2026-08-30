import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { UserRound, MapPin, Calendar } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function Skeleton({ className }) {
  return <div className={`bg-zinc-100 animate-pulse rounded-xl ${className}`} />;
}

function ProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-5">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-40 h-5" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-32 h-3" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-20 h-9 rounded-full" />
          <Skeleton className="w-24 h-9 rounded-full" />
        </div>
      </div>
      <div className="flex gap-8 mb-10 pb-10 border-b border-zinc-100">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="w-10 h-7" />
            <Skeleton className="w-16 h-3" />
          </div>
        ))}
      </div>
      <Skeleton className="w-32 h-5 mb-5" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-100 overflow-hidden">
            <Skeleton className="h-40 rounded-none" />
            <div className="p-4 space-y-2">
              <Skeleton className="w-3/4 h-4" />
              <Skeleton className="w-1/2 h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnfollowModal({ name, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 text-center mb-1">Unfollow {name}?</h3>
        <p className="text-sm text-zinc-400 text-center mb-6">You will stop seeing their public trips.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading} className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium py-2.5 rounded-full transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : "Unfollow"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserListModal({ title, userId, type, onClose }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchUsers = async (nextCursor = null) => {
    try {
      const url = `/follow/${userId}/${type}${nextCursor ? `?cursor=${nextCursor}` : ""}`;
      const res = await api.get(url);
      const data = type === "followers" ? res.data.followers : res.data.following;
      setUsers((prev) => nextCursor ? [...prev, ...data] : data);
      setHasMore(res.data.hasMore);
      setCursor(res.data.nextCursor);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="font-semibold text-zinc-900 capitalize">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-96">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="w-32 h-4" /><Skeleton className="w-20 h-3" /></div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-zinc-400 text-sm py-10">No {type} yet</p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {users.map((u) => (
                <div key={u._id} onClick={() => { onClose(); navigate(`/u/${u.username}`); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-full bg-rose-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-sm font-bold text-rose-600">{initials(u.name)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{u.name}</p>
                    <p className="text-xs text-zinc-400">@{u.username}</p>
                  </div>
                  <span className="text-xs text-zinc-300">{u.followersCount || 0} followers</span>
                </div>
              ))}
              {hasMore && (
                <button onClick={() => { setLoadingMore(true); fetchUsers(cursor); }} disabled={loadingMore} className="w-full py-3 text-sm text-rose-500 font-medium disabled:opacity-50">
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  // ✅ All state null/undefined until single fetch completes
  const [data, setData] = useState(null); // { profile, trips, isFollowing, followersCount, followingCount }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [followLoading, setFollowLoading] = useState(false);
  const [showUnfollowModal, setShowUnfollowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState(null);

  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError("");

    // ✅ ONE request — profile + follow status together, no sequential calls
    api.get(`/users/profile/${username}`)
      .then((res) => {
        setData({
          profile: res.data.user,
          trips: res.data.trips || [],
          isFollowing: res.data.isFollowing || false,
          followersCount: res.data.user.followersCount || 0,
          followingCount: res.data.user.followingCount || 0,
        });
      })
      .catch((err) => setError(err.response?.data?.message || "User not found"))
      .finally(() => setLoading(false));
  }, [username]);

  const updateFollowState = (isFollowing, newFollowersCount) => {
    setData((prev) => ({
      ...prev,
      isFollowing,
      followersCount: typeof newFollowersCount === "number" ? newFollowersCount : prev.followersCount,
    }));
  };

  const handleFollowClick = () => {
    if (!currentUser) { navigate("/login"); return; }
    if (data?.isFollowing) setShowUnfollowModal(true);
    else doFollow();
  };

  const doFollow = async () => {
    setFollowLoading(true);
    try {
      const res = await api.post(`/follow/${data.profile._id}/follow`);
      updateFollowState(true, res.data.followersCount);
    } catch (err) {
      if (err.response?.data?.isFollowing) updateFollowState(true, null);
    } finally { setFollowLoading(false); }
  };

  const doUnfollow = async () => {
    setFollowLoading(true);
    try {
      const res = await api.delete(`/follow/${data.profile._id}/follow`);
      updateFollowState(false, res.data.followersCount);
      setShowUnfollowModal(false);
    } catch (err) {
      if (err.response?.status === 404) { updateFollowState(false, null); setShowUnfollowModal(false); }
    } finally { setFollowLoading(false); }
  };

  const copyProfileUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : null;
  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const memberSince = data?.profile?.createdAt
    ? new Date(data.profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  // ✅ Skeleton until everything is ready — page never shows partial data
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-zinc-100">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-zinc-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <span className="flex items-baseline leading-none">
            <span className="font-serif text-xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">Wohoo</span>
            <span className="font-serif text-xl font-bold tracking-tight text-zinc-900">.in</span>
          </span>
          <div className="w-16" />
        </nav>
        <ProfileSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <UserRound className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <p className="text-zinc-600 font-medium">{error}</p>
        <Link to="/dashboard" className="text-sm text-rose-500 hover:text-rose-600">← Back to Dashboard</Link>
      </div>
    );
  }

  const { profile, trips, isFollowing, followersCount, followingCount } = data;

  return (
    <div className="min-h-screen bg-white">
      {showUnfollowModal && (
        <UnfollowModal
          name={profile?.name?.split(" ")[0]}
          loading={followLoading}
          onConfirm={doUnfollow}
          onCancel={() => setShowUnfollowModal(false)}
        />
      )}
      {modal && (
        <UserListModal title={modal} userId={profile._id} type={modal} onClose={() => setModal(null)} />
      )}

      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-zinc-100 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <button className="flex items-baseline leading-none cursor-pointer" onClick={() => navigate("/dashboard")} aria-label="Wohoo.in home">
          <span className="font-serif text-xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">Wohoo</span>
          <span className="font-serif text-xl font-bold tracking-tight text-zinc-900">.in</span>
        </button>
        <div className="w-16" />
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-8 gap-4">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-20 h-20 rounded-full bg-rose-200 flex items-center justify-center overflow-hidden flex-shrink-0 ring-4 ring-rose-100">
              {profile?.avatar
                ? <img src={profile.avatar} className="w-full h-full object-cover" alt={profile.name} />
                : <span className="text-2xl font-bold text-rose-600">{initials(profile?.name)}</span>
              }
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">{profile?.name}</h1>
              <p className="text-zinc-400 text-sm mt-0.5">@{profile?.username}</p>
              {memberSince && <p className="text-zinc-400 text-xs mt-1">Member since {memberSince}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={copyProfileUrl} className="flex items-center gap-2 text-sm border border-zinc-200 hover:border-zinc-300 text-zinc-600 px-4 py-2 rounded-full transition-all">
              {copied
                ? <><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>Share</>
              }
            </button>

            {isOwnProfile ? (
              <button onClick={() => navigate("/set-username")} className="text-sm bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-full transition-all">Edit Profile</button>
            ) : (
              <button
                onClick={handleFollowClick}
                disabled={followLoading}
                className={`flex items-center gap-2 text-sm font-medium px-5 py-2 rounded-full transition-all disabled:opacity-60 ${
                  isFollowing
                    ? "bg-zinc-100 hover:bg-red-50 hover:text-red-500 border border-zinc-200 hover:border-red-200 text-zinc-700"
                    : "bg-rose-500 hover:bg-rose-600 text-white"
                }`}
              >
                {followLoading
                  ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                  : isFollowing
                  ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Following</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Follow</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Stats — guaranteed correct on first render */}
        <div className="flex gap-8 mb-10 pb-10 border-b border-zinc-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900">{trips.length}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Public Trips</p>
          </div>
          <button onClick={() => setModal("followers")} className="text-center hover:opacity-70 transition-opacity">
            <p className="text-2xl font-bold text-zinc-900">{followersCount}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Followers</p>
          </button>
          <button onClick={() => setModal("following")} className="text-center hover:opacity-70 transition-opacity">
            <p className="text-2xl font-bold text-zinc-900">{followingCount}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Following</p>
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-5">
            {isOwnProfile ? "Your public trips" : `${profile?.name?.split(" ")[0]}'s trips`}
          </h2>

          {trips.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-12 text-center">
              <p className="text-zinc-400 text-sm">
                {isOwnProfile ? "No public trips yet. Make a trip public from your dashboard." : "No public trips yet."}
              </p>
              {isOwnProfile && (
                <button onClick={() => navigate("/dashboard")} className="mt-4 text-sm text-rose-500 hover:text-rose-600 font-medium">Go to Dashboard →</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {trips.map((trip) => (
                <div
                  key={trip._id}
                  onClick={() => navigate(`/trips/${trip._id}`)}
                  className="bg-white rounded-2xl border border-zinc-100 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
                >
                  <div className="h-40 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100 relative overflow-hidden">
                    {trip.coverPhoto && <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        trip.status === "upcoming" ? "bg-emerald-100 text-emerald-700" :
                        trip.status === "ongoing" ? "bg-blue-100 text-blue-700" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        {trip.status?.charAt(0).toUpperCase() + trip.status?.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-zinc-800 text-sm">{trip.name}</p>
                    {trip.destination?.name && <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {trip.destination.fullLabel || trip.destination.name}</p>}
                    {trip.startDate && <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(trip.startDate)}</p>}
                    <div className="flex -space-x-1 mt-3">
                      {trip.members?.slice(0, 4).map((m, i) => (
                        <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-rose-200 flex items-center justify-center" style={{ zIndex: 10 - i }}>
                          {m.user?.avatar ? <img src={m.user.avatar} className="w-full h-full rounded-full object-cover" alt="" /> : <span className="font-bold text-rose-600" style={{ fontSize: "8px" }}>{initials(m.user?.name)}</span>}
                        </div>
                      ))}
                      {trip.members?.length > 4 && (
                        <div className="w-6 h-6 rounded-full border-2 border-white bg-zinc-100 flex items-center justify-center">
                          <span className="text-zinc-500" style={{ fontSize: "8px" }}>+{trip.members.length - 4}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}