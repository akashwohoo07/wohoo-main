import { api } from "./client";
import type { Trip, User, Place } from "./types";

// ── Auth ───────────────────────────────────────────────────────
export async function googleMobileLogin(idToken: string, mode: "login" | "signup") {
  const { data } = await api.post("/auth/google/mobile", { idToken, mode });
  return data as { accessToken: string; refreshToken: string; user: User };
}
export async function fetchMe() {
  const { data } = await api.get("/auth/me");
  return data.user as User;
}
export async function logoutServer(refreshToken?: string) {
  await api.post("/auth/logout", { refreshToken });
}

// ── Trips ──────────────────────────────────────────────────────
export async function fetchTrips() {
  const { data } = await api.get("/trips");
  return {
    upcoming: (data.upcoming || []) as Trip[],
    past: (data.past || []) as Trip[],
  };
}
export async function fetchTrip(id: string) {
  const { data } = await api.get(`/trips/${id}`);
  return data.trip as Trip;
}
export async function createTrip(payload: {
  name: string;
  destination?: any;
  startDate?: string;
  endDate?: string;
}) {
  const { data } = await api.post("/trips", payload);
  return data.trip as Trip;
}

// ── Explore (Google Places proxy) ──────────────────────────────
export async function exploreSearch(params: {
  ll: string;
  kind: string;
  query?: string;
  radius?: number;
}) {
  const { data } = await api.get("/explore/search", { params });
  return (data.results || []) as Place[];
}

// ── Invitations (deep links: wohoo://invite/:token) ────────────
export async function fetchInvitation(token: string) {
  const { data } = await api.get(`/trips/invitations/${token}`);
  return data.invite as {
    role: "editor" | "viewer";
    invitedBy?: { name?: string; avatar?: string };
    trip?: { _id?: string; name?: string; destination?: any; coverPhoto?: string; startDate?: string; endDate?: string };
  };
}
export async function respondInvitation(token: string, action: "accept" | "decline") {
  const { data } = await api.post(`/trips/invitations/${token}/respond`, { action });
  return data as { success: boolean; tripId?: string; message?: string };
}

// ── Users / social ─────────────────────────────────────────────
export async function searchUsers(q: string) {
  const { data } = await api.get("/users/search", { params: { q } });
  return (data.users || []) as User[];
}
export async function fetchProfile(username: string) {
  const { data } = await api.get(`/profile/${username}`);
  return data as { user: User; trips: Trip[]; isFollowing?: boolean };
}
export async function toggleFollow(userId: string, follow: boolean) {
  const { data } = await api.post(`/follow/${userId}`, { follow });
  return data;
}
