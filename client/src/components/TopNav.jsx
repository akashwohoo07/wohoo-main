import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plane, Compass, Heart, Users, MoreVertical, LogOut,
  User as UserIcon, Search as SearchIcon, Settings as SettingsIcon, BarChart3,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { ADMIN_PATH } from "../lib/adminPath";

function NavMenu({ user, onProfile, onSettings, onLogout, onCommunities, onAdmin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
        title="More"
        aria-label="More options"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-50 w-48 bg-white rounded-xl shadow-2xl border border-zinc-100 py-1.5 overflow-hidden">
          {/* Mobile only — the top nav tabs (incl. Community) are hidden on small screens */}
          <button
            onClick={() => { setOpen(false); onCommunities(); }}
            className="md:hidden w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Users className="w-4 h-4 text-zinc-400" />
            Communities
          </button>
          <div className="md:hidden h-px bg-zinc-100 my-1" />
          {user?.username && (
            <button
              onClick={() => { setOpen(false); onProfile(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <UserIcon className="w-4 h-4 text-zinc-400" />
              View profile
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onSettings(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <SettingsIcon className="w-4 h-4 text-zinc-400" />
            Settings
          </button>
          {user?.isAdmin && (
            <button
              onClick={() => { setOpen(false); onAdmin(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <BarChart3 className="w-4 h-4 text-zinc-400" />
              Admin analytics
            </button>
          )}
          <div className="h-px bg-zinc-100 my-1" />
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

// Shared top navigation bar. `active` = one of "trips" | "discover" | "wishlist" | "community".
export default function TopNav({ active }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (name) => name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  const tabs = [
    { key: "trips", label: "Trips", icon: Plane, to: "/dashboard" },
    { key: "discover", label: "Discover", icon: Compass, to: "/discover" },
    { key: "wishlist", label: "Wishlist", icon: Heart, to: "/wishlist" },
    { key: "community", label: "Community", icon: Users, to: "/communities" },
  ];

  return (
    <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-zinc-100">
      <button
        onClick={() => navigate("/dashboard")}
        aria-label="Wohoo.in home"
        className="flex items-baseline leading-none hover:opacity-80 transition-opacity"
      >
        <span className="font-serif text-2xl font-bold tracking-tight bg-gradient-to-br from-[#F9A8D4] to-[#ec4899] bg-clip-text text-transparent">
          Wohoo
        </span>
        <span className="font-serif text-2xl font-bold tracking-tight text-zinc-900">.in</span>
      </button>

      <div className="hidden md:flex gap-8">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => navigate(tab.to)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? "text-rose-500 border-b-2 border-rose-500 pb-1" : "text-zinc-400 hover:text-zinc-600"}`}
            >
              <TabIcon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <NotificationBell />
        <button
          onClick={() => navigate("/search")}
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          title="Find people"
        >
          <SearchIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => (user?.username ? navigate(`/u/${user.username}`) : navigate("/set-username"))}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity ml-1 pl-1"
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
        <NavMenu
          user={user}
          onProfile={() => navigate(`/u/${user.username}`)}
          onSettings={() => navigate("/settings")}
          onCommunities={() => navigate("/communities")}
          onAdmin={() => navigate(`/${ADMIN_PATH}`)}
          onLogout={async () => { await logout(); navigate("/login"); }}
        />
      </div>
    </nav>
  );
}
