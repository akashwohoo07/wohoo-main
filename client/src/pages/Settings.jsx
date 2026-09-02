import { useNavigate } from "react-router-dom";
import { ArrowLeft, AtSign, Mail, ChevronRight, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// A settings row. Clickable rows get a chevron; static rows just show a value.
function Row({ icon: Icon, label, value, hint, onClick, action }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${onClick ? "hover:bg-zinc-50 transition-colors" : ""}`}
    >
      <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        {value ? <p className="text-xs text-zinc-400 truncate">{value}</p> : hint ? <p className="text-xs text-zinc-300 truncate">{hint}</p> : null}
      </div>
      {action ? <span className="text-xs font-medium text-rose-500 flex-shrink-0">{action}</span> : null}
      {onClick && <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />}
    </Wrapper>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-100">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/dashboard")} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-semibold text-zinc-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Identity card */}
        <div className="flex items-center gap-4 bg-white border border-zinc-100 rounded-2xl p-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center flex-shrink-0">
            {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-lg font-bold text-rose-600">{(user?.name || "?").charAt(0).toUpperCase()}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-zinc-900 truncate">{user?.name}</p>
            <p className="text-sm text-zinc-400 truncate">{user?.username ? `@${user.username}` : "No username yet"}</p>
          </div>
        </div>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-2">Account</h2>
          <div className="bg-white border border-zinc-100 rounded-2xl divide-y divide-zinc-50 overflow-hidden">
            <Row
              icon={AtSign}
              label="Username"
              value={user?.username ? `@${user.username}` : undefined}
              hint={user?.username ? undefined : "Pick a username so others can find you"}
              onClick={() => navigate("/set-username")}
              action={user?.username ? "Change" : "Set"}
            />
            {user?.email && <Row icon={Mail} label="Email" value={user.email} />}
            {user?.username && <Row icon={UserIcon} label="View public profile" onClick={() => navigate(`/u/${user.username}`)} />}
          </div>
        </section>

        {/* Placeholder for future settings */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-2">Preferences</h2>
          <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-zinc-400">More settings coming soon.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
