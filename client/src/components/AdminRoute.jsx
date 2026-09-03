import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Client-side gate for the admin UI. The real security is server-side
// (requireAdmin on /api/admin/*); this just avoids rendering/routing the page
// for non-admins.
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-zinc-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}
