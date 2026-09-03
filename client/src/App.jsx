import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CreateTrip from "./pages/CreateTrip";
import TripDetail from "./pages/TripDetail";
import SetUsername from "./pages/SetUsername";
import InviteAccept from "./pages/InviteAccept";
import UserProfile from "./pages/UserProfile";
import SearchUsers from "./pages/SearchUsers";
import Settings from "./pages/Settings";
import AdminRoute from "./components/AdminRoute";
import { ADMIN_PATH } from "./lib/adminPath";
import { lazy, Suspense } from "react";
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
import Communities from "./pages/Communities";
import CommunityDetail from "./pages/CommunityDetail";
import HomePage from "./pages/HomePage"; // ← added

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} /> {/* ← changed */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/trips/create" element={<ProtectedRoute><CreateTrip /></ProtectedRoute>} />
          <Route path="/trips/:id" element={<ProtectedRoute><TripDetail /></ProtectedRoute>} />
          <Route path="/set-username" element={<ProtectedRoute><SetUsername /></ProtectedRoute>} />
          <Route path="/invite/:token" element={<ProtectedRoute><InviteAccept /></ProtectedRoute>} />
          <Route path="/u/:username" element={<UserProfile />} />
          <Route path="/search" element={<ProtectedRoute><SearchUsers /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/communities" element={<ProtectedRoute><Communities /></ProtectedRoute>} />
          <Route path="/communities/:id" element={<ProtectedRoute><CommunityDetail /></ProtectedRoute>} />
          <Route path={`/${ADMIN_PATH}`} element={<AdminRoute><Suspense fallback={<div className="flex items-center justify-center h-screen text-zinc-400">Loading…</div>}><AdminDashboard /></Suspense></AdminRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}