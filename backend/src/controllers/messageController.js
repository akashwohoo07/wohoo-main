import mongoose from "mongoose";
import Message from "../models/Message.js";
import CommunityMember from "../models/CommunityMember.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import Community from "../models/Community.js";
import { getMembership } from "./communityController.js";
import { createNotification } from "./notificationController.js";
import { escapeRegex } from "../middleware/sanitize.js";

const populateMessage = (q) =>
  q
    .populate("sender", "name avatar username")
    .populate("mentions", "name username")
    .populate("sharedTrip", "name destination coverPhoto startDate endDate");

// Never send the content of a deleted message — only a tombstone. Keeps deleted
// text/trips off the wire while still rendering "deleted by admin"/"deleted".
function serializeMsg(m) {
  if (!m.deleted) return m; // includes reactions, imageUrl, mentions, sharedTrip
  return {
    _id: m._id,
    community: m.community,
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

// Create a system notice (e.g. "@alice joined"). Exported so the community
// controller can post join/leave/remove notices into the chat.
export async function postSystemMessage(communityId, subjectUserId, text) {
  try {
    return await Message.create({ community: communityId, type: "system", sender: subjectUserId, text });
  } catch (e) {
    console.error("System message failed:", e.message);
    return null;
  }
}

// ── LIST MESSAGES ─────────────────────────────────────────────
// Two modes:
//   ?after=<iso>  → messages newer than a timestamp, ascending (chat polling)
//   ?cursor=<iso> → older history, newest-first (infinite scroll up)
export const listMessages = async (req, res, next) => {
  try {
    if (!(await getMembership(req.params.id, req.user._id))) {
      return res.status(403).json({ success: false, message: "Members only" });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);

    if (req.query.after) {
      const after = new Date(req.query.after);
      // New messages since `after`, plus existing messages that CHANGED since
      // `after` (reactions toggled, or deleted) so every client stays live.
      const [fresh, changed] = await Promise.all([
        populateMessage(
          Message.find({ community: req.params.id, createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(limit)
        ).lean(),
        populateMessage(
          Message.find({ community: req.params.id, updatedAt: { $gt: after }, createdAt: { $lte: after } }).limit(50)
        ).lean(),
      ]);
      return res.json({
        success: true,
        messages: fresh.map(serializeMsg),
        updated: changed.map(serializeMsg), // client merges these by _id
      });
    }

    const query = { community: req.params.id };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }
    const docs = await populateMessage(
      Message.find(query).sort({ createdAt: -1 }).limit(limit + 1)
    ).lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    res.json({
      success: true,
      // Return chronological (oldest→newest) for direct rendering.
      messages: page.reverse().map(serializeMsg),
      hasMore,
      nextCursor: hasMore ? page[0].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── SEND MESSAGE ──────────────────────────────────────────────
export const sendMessage = async (req, res, next) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) return res.status(403).json({ success: false, message: "Members only" });

    const { text = "", type = "text", tripId } = req.body || {};
    const community = await Community.findById(req.params.id).select("name");
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });

    const data = {
      community: req.params.id,
      sender: req.user._id,
      type: type === "trip_share" ? "trip_share" : "text",
      text: String(text).slice(0, 4000),
      mentions: [],
    };

    if (data.type === "trip_share") {
      if (!mongoose.isValidObjectId(tripId)) {
        return res.status(400).json({ success: false, message: "A trip is required to share" });
      }
      // Can only share a trip you're a member of.
      const trip = await Trip.findOne({ _id: tripId, "members.user": req.user._id }).select("_id");
      if (!trip) return res.status(403).json({ success: false, message: "You can only share trips you're part of" });
      data.sharedTrip = tripId;
    } else if (!data.text.trim()) {
      return res.status(400).json({ success: false, message: "Message can't be empty" });
    }

    // Resolve @mentions → members of THIS community only (excluding the sender).
    const handles = [...new Set((data.text.match(/@([a-zA-Z0-9_]+)/g) || []).map((s) => s.slice(1).toLowerCase()))];
    if (handles.length) {
      const users = await User.find({ username: { $in: handles } }).select("_id").lean();
      const ids = users.map((u) => u._id);
      if (ids.length) {
        const memberRows = await CommunityMember.find({ community: req.params.id, user: { $in: ids } }).select("user").lean();
        const memberSet = new Set(memberRows.map((m) => String(m.user)));
        data.mentions = ids.filter((id) => memberSet.has(String(id)) && String(id) !== String(req.user._id));
      }
    }

    let message = await Message.create(data);
    message = await populateMessage(Message.findById(message._id)).lean();

    // Notify mentioned members (non-blocking) — powers the "tagged you" badge/popup.
    if (data.mentions.length) {
      const snippet = data.text.length > 80 ? `${data.text.slice(0, 80)}…` : data.text;
      await Promise.allSettled(
        data.mentions.map((uid) =>
          createNotification({
            recipient: uid,
            type: "mention",
            actor: req.user._id,
            community: req.params.id,
            message: `${req.user.name} mentioned you in "${community.name}": ${snippet}`,
          })
        )
      );
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    next(err);
  }
};

// ── DELETE A MESSAGE ──────────────────────────────────────────
// WhatsApp-style: the SENDER can delete their own message, and the community
// OWNER (admin) can delete anyone's — which shows "deleted by admin".
export const deleteMessage = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id).select("owner");
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });
    const message = await Message.findOne({ _id: req.params.messageId, community: req.params.id });
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });

    const isOwner = community.owner.toString() === req.user._id.toString();
    const isSender = message.sender && message.sender.toString() === req.user._id.toString();
    if (!isOwner && !isSender) {
      return res.status(403).json({ success: false, message: "You can't delete this message" });
    }

    if (!message.deleted) {
      message.deleted = true;
      message.deletedBy = req.user._id;
      message.deletedByAdmin = isOwner && !isSender; // admin removed someone else's message
      message.text = "";
      message.sharedTrip = undefined;
      message.imageUrl = undefined;
      message.mentions = [];
      message.reactions = [];
      await message.save();
    }

    const populated = await populateMessage(Message.findById(message._id)).lean();
    res.json({ success: true, message: serializeMsg(populated) });
  } catch (err) {
    next(err);
  }
};

// ── REACT TO A MESSAGE (toggle emoji) ─────────────────────────
export const reactToMessage = async (req, res, next) => {
  try {
    if (!(await getMembership(req.params.id, req.user._id))) {
      return res.status(403).json({ success: false, message: "Members only" });
    }
    const { emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 12) {
      return res.status(400).json({ success: false, message: "A valid emoji is required" });
    }
    const message = await Message.findOne({ _id: req.params.messageId, community: req.params.id });
    if (!message || message.deleted) return res.status(404).json({ success: false, message: "Message not found" });

    const uid = req.user._id.toString();
    const bucket = message.reactions.find((r) => r.emoji === emoji);
    if (bucket) {
      if (bucket.users.some((u) => u.toString() === uid)) {
        // Toggle off; drop the bucket if it becomes empty.
        bucket.users = bucket.users.filter((u) => u.toString() !== uid);
        if (bucket.users.length === 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      } else {
        bucket.users.push(req.user._id);
      }
    } else {
      message.reactions.push({ emoji, users: [req.user._id] });
    }
    await message.save();

    const populated = await populateMessage(Message.findById(message._id)).lean();
    res.json({ success: true, message: serializeMsg(populated) });
  } catch (err) {
    next(err);
  }
};

// ── SEARCH MESSAGES IN A COMMUNITY ────────────────────────────
export const searchMessages = async (req, res, next) => {
  try {
    if (!(await getMembership(req.params.id, req.user._id))) {
      return res.status(403).json({ success: false, message: "Members only" });
    }
    const q = (req.query.q || "").trim();
    if (q.length < 1) return res.json({ success: true, messages: [] });

    const rx = new RegExp(escapeRegex(q), "i");
    const docs = await populateMessage(
      Message.find({
        community: req.params.id,
        deleted: false,
        type: { $in: ["text", "trip_share"] },
        text: rx,
      })
        .sort({ createdAt: -1 })
        .limit(30)
    ).lean();

    res.json({ success: true, messages: docs.map(serializeMsg) });
  } catch (err) {
    next(err);
  }
};

// ── MARK CHAT READ ────────────────────────────────────────────
export const markCommunityRead = async (req, res, next) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) return res.status(403).json({ success: false, message: "Members only" });
    await CommunityMember.updateOne({ _id: membership._id }, { $set: { lastReadAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
