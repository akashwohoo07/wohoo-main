import mongoose from "mongoose";
import Notification from "../models/Notification.js";

// Internal helper used by other modules (e.g. trip invites) to raise a
// notification. Never awaited on a critical path in a way that can fail the
// request — callers wrap it in try/catch, like emails.
export async function createNotification(data) {
  return Notification.create(data);
}

// Resolve every notification tied to an invitation for a given recipient once
// the invite is accepted/declined (from the bell OR the invite page). Flips the
// status so Accept/Decline disappear, optionally rewrites the message, and marks
// it read so the badge clears.
export async function resolveInvitationNotifications(invitationId, recipientId, status, message) {
  return Notification.updateMany(
    { invitation: invitationId, recipient: recipientId },
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

const serialize = (n) => ({
  _id: n._id,
  type: n.type,
  actor: n.actor,
  trip: n.trip,
  community: n.community,
  request: n.request,
  invitation: n.invitation,
  token: n.token,
  role: n.role,
  message: n.message,
  status: n.status || null,
  read: n.read,
  createdAt: n.createdAt,
});

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
    );
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
