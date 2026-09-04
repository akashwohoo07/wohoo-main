import mongoose from "mongoose";
import Notification from "../models/Notification.js";

// Internal helper used by other modules (e.g. trip invites) to raise a
// notification. Never awaited on a critical path in a way that can fail the
// request — callers wrap it in try/catch, like emails.
export async function createNotification(data) {
  return Notification.create(data);
}

// Resolve every notification tied to an invitation once the invite is
// accepted/declined/cancelled/expired (from the bell, the invite page, or a
// cancel elsewhere). Flips the status so Accept/Decline disappear, optionally
// rewrites the message, and marks it read so the badge clears. `recipientId` is
// optional — pass null to resolve for every recipient of that invitation (e.g.
// when the owner cancels it).
export async function resolveInvitationNotifications(invitationId, recipientId, status, message) {
  return Notification.updateMany(
    { invitation: invitationId, ...(recipientId ? { recipient: recipientId } : {}) },
    { $set: { read: true, ...(status ? { status } : {}), ...(message ? { message } : {}) } }
  );
}

// Resolve the owner's join-request notification once the request is handled
// (from the bell OR the community page), so the stale Accept/Reject go away.
export async function resolveRequestNotifications(requestId, status, message) {
  return Notification.updateMany(
    { request: requestId },
    { $set: { read: true, ...(status ? { status } : {}), ...(message ? { message } : {}) } }
  );
}

// Derive the LIVE actionable state of an actionable notification from its linked
// invitation/request, rather than trusting the persisted `status` alone. This is
// what keeps the bell in sync with the rest of the platform: if an invite was
// cancelled, expired, or a request was handled through any path (even one that
// forgot to resolve the notification), the read recomputes the true outcome so
// stale Accept/Reject never appear. Pure read — no writes here.
//   actionable → still show Accept/Reject
//   outcome    → terminal state for the resolved chip: accepted | declined |
//                rejected | cancelled | expired | null
// `n.invitation` / `n.request` must be populated (with at least `status`) or be
// null when the underlying doc was deleted.
export function deriveActionState(n) {
  if (n.type === "trip_invite") {
    const s = n.invitation?.status;
    if (s === "pending") return { actionable: true, outcome: null };
    if (!n.invitation) return { actionable: false, outcome: "cancelled" }; // invite deleted
    return { actionable: false, outcome: s }; // accepted | declined | expired
  }
  if (n.type === "community_request") {
    const s = n.request?.status;
    if (s === "pending") return { actionable: true, outcome: null };
    if (!n.request) return { actionable: false, outcome: "cancelled" }; // request deleted
    return { actionable: false, outcome: s }; // accepted | rejected
  }
  return { actionable: false, outcome: null };
}

const serialize = (n) => {
  const { actionable, outcome } = deriveActionState(n);
  // `request`/`invitation` are populated for derivation but the client needs the
  // bare ids (it posts to /requests/:id/respond), so unwrap back to _id.
  const idOf = (v) => (v && typeof v === "object" ? v._id : v) || null;
  return {
    _id: n._id,
    type: n.type,
    actor: n.actor,
    trip: n.trip,
    community: n.community,
    request: idOf(n.request),
    invitation: idOf(n.invitation),
    token: n.token,
    role: n.role,
    message: n.message,
    // Persisted status, reconciled with the live outcome so callers reading
    // `status` still see the truth even if a mutation path missed the resolve.
    status: actionable ? "pending" : n.status || outcome || null,
    actionable,
    outcome,
    read: n.read,
    createdAt: n.createdAt,
  };
};

// ── LIST (cursor paginated) ───────────────────────────────────
export const listNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const query = { recipient: req.user._id };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }

    const docs = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("actor", "name avatar username")
      .populate("trip", "name destination coverPhoto")
      .populate("community", "name slug type avatar")
      // Linked invite/request (status only) — used to derive the LIVE actionable
      // state so the bell can't show stale Accept/Reject. Null when deleted.
      .populate("invitation", "status")
      .populate("request", "status")
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    res.json({
      success: true,
      notifications: page.map(serialize),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── UNREAD COUNT (badge) ──────────────────────────────────────
export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
};

// ── MARK ONE READ ─────────────────────────────────────────────
export const markRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    // Authorization: can only mark your own notifications.
    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { read: true } },
      { new: true }
    )
      .populate("actor", "name avatar username")
      .populate("trip", "name destination coverPhoto")
      .populate("community", "name slug type avatar")
      .populate("invitation", "status")
      .populate("request", "status")
      .lean();
    if (!updated) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, notification: serialize(updated) });
  } catch (err) {
    next(err);
  }
};

// ── MARK ALL READ ─────────────────────────────────────────────
export const markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true, message: "All notifications marked read" });
  } catch (err) {
    next(err);
  }
};
