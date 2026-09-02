import mongoose from "mongoose";
import TripMessage from "../models/TripMessage.js";
import Trip from "../models/Trip.js";

// Access control: only CURRENT trip members can touch the chat. Because we check
// Trip.members live on every request, a user who leaves or is removed instantly
// loses access — no stale membership.
async function loadMembership(req, res) {
  const { tripId } = req.params;
  if (!mongoose.isValidObjectId(tripId)) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const trip = await Trip.findById(tripId).select("members owner name");
  if (!trip) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const member = trip.members.find((m) => m.user.toString() === req.user._id.toString());
  if (!member) {
    res.status(403).json({ success: false, message: "Only trip members can access this chat" });
    return null;
  }
  return { trip, member };
}

const populateMsg = (q) =>
  q
    .populate("sender", "name avatar username")
    .populate({
      path: "replyTo",
      select: "sender type text sharedPlace deleted",
      populate: { path: "sender", select: "name username" },
    });

// Deleted messages go out as tombstones only — never their content.
function serializeMsg(m) {
  if (!m.deleted) return m;
  return {
    _id: m._id,
    trip: m.trip,
    sender: m.sender,
    type: m.type,
    deleted: true,
    deletedByAdmin: !!m.deletedByAdmin,
    deletedBy: m.deletedBy,
    reactions: [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// Whitelist the denormalized place fields — never trust the whole body.
function pickPlace(p = {}) {
  return {
    placeId: p.placeId ? String(p.placeId) : undefined,
    name: String(p.name).slice(0, 200),
    category: p.category ? String(p.category).slice(0, 60) : undefined,
    address: p.address ? String(p.address).slice(0, 300) : undefined,
    photo: p.photo ? String(p.photo) : undefined,
    rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : undefined,
    lat: Number.isFinite(Number(p.lat)) ? Number(p.lat) : undefined,
    lng: Number.isFinite(Number(p.lng)) ? Number(p.lng) : undefined,
  };
}

// Exported so the trip controller can post "@user joined" when an invite is accepted.
export async function postTripSystemMessage(tripId, subjectUserId, text) {
  try {
    return await TripMessage.create({ trip: tripId, type: "system", sender: subjectUserId, text });
  } catch (e) {
    console.error("Trip system message failed:", e.message);
    return null;
  }
}

// ── LIST ──────────────────────────────────────────────────────
export const listMessages = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);

    if (req.query.after) {
      const after = new Date(req.query.after);
      const [fresh, changed] = await Promise.all([
        populateMsg(
          TripMessage.find({ trip: req.params.tripId, createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(limit)
        ).lean(),
        populateMsg(
          TripMessage.find({ trip: req.params.tripId, updatedAt: { $gt: after }, createdAt: { $lte: after } }).limit(50)
        ).lean(),
      ]);
      return res.json({ success: true, messages: fresh.map(serializeMsg), updated: changed.map(serializeMsg) });
    }

    const query = { trip: req.params.tripId };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }
    const docs = await populateMsg(TripMessage.find(query).sort({ createdAt: -1 }).limit(limit + 1)).lean();
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    res.json({
      success: true,
      messages: page.reverse().map(serializeMsg),
      hasMore,
      nextCursor: hasMore ? page[0].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── SEND ──────────────────────────────────────────────────────
export const sendMessage = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const { text = "", type = "text", replyTo, sharedPlace } = req.body || {};

    const data = { trip: req.params.tripId, sender: req.user._id, type: "text", text: String(text).slice(0, 4000) };

    if (type === "place_share") {
      if (!sharedPlace || !sharedPlace.name) {
        return res.status(400).json({ success: false, message: "A place is required to share" });
      }
      data.type = "place_share";
      data.sharedPlace = pickPlace(sharedPlace);
    } else if (!data.text.trim()) {
      return res.status(400).json({ success: false, message: "Message can't be empty" });
    }

    if (replyTo) {
      if (!mongoose.isValidObjectId(replyTo)) {
        return res.status(400).json({ success: false, message: "Invalid reply target" });
      }
      const parent = await TripMessage.findOne({ _id: replyTo, trip: req.params.tripId }).select("_id");
      if (!parent) return res.status(400).json({ success: false, message: "Reply target not found" });
      data.replyTo = replyTo;
    }

    const created = await TripMessage.create(data);
    const populated = await populateMsg(TripMessage.findById(created._id)).lean();
    res.status(201).json({ success: true, message: serializeMsg(populated) });
  } catch (err) {
    next(err);
  }
};

// ── REACT (toggle) ────────────────────────────────────────────
export const reactToMessage = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const { emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 12) {
      return res.status(400).json({ success: false, message: "A valid emoji is required" });
    }
    const message = await TripMessage.findOne({ _id: req.params.messageId, trip: req.params.tripId });
    if (!message || message.deleted) return res.status(404).json({ success: false, message: "Message not found" });

    const uid = req.user._id.toString();
    const bucket = message.reactions.find((r) => r.emoji === emoji);
    if (bucket) {
      if (bucket.users.some((u) => u.toString() === uid)) {
        bucket.users = bucket.users.filter((u) => u.toString() !== uid);
        if (bucket.users.length === 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      } else {
        bucket.users.push(req.user._id);
      }
    } else {
      message.reactions.push({ emoji, users: [req.user._id] });
    }
    await message.save();

    const populated = await populateMsg(TripMessage.findById(message._id)).lean();
    res.json({ success: true, message: serializeMsg(populated) });
  } catch (err) {
    next(err);
  }
};

// ── DELETE (sender, or trip owner = admin) ────────────────────
export const deleteMessage = async (req, res, next) => {
  try {
    const ctx = await loadMembership(req, res);
    if (!ctx) return;
    const message = await TripMessage.findOne({ _id: req.params.messageId, trip: req.params.tripId });
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });

    const isOwner = ctx.trip.owner.toString() === req.user._id.toString();
    const isSender = message.sender && message.sender.toString() === req.user._id.toString();
    if (!isOwner && !isSender) {
      return res.status(403).json({ success: false, message: "You can't delete this message" });
    }

    if (!message.deleted) {
      message.deleted = true;
      message.deletedBy = req.user._id;
      message.deletedByAdmin = isOwner && !isSender;
      message.text = "";
      message.sharedPlace = undefined;
      message.reactions = [];
      await message.save();
    }

    const populated = await populateMsg(TripMessage.findById(message._id)).lean();
    res.json({ success: true, message: serializeMsg(populated) });
  } catch (err) {
    next(err);
  }
};
