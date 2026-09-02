import crypto from "crypto";
import mongoose from "mongoose";
import Community from "../models/Community.js";
import CommunityMember from "../models/CommunityMember.js";
import JoinRequest from "../models/JoinRequest.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { createNotification, markRequestNotificationsRead } from "./notificationController.js";
import { postSystemMessage } from "./messageController.js";
import { analyticsReadPreference } from "../config/readPreference.js";

const handle = (u) => (u?.username ? `@${u.username}` : u?.name || "Someone");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function slugify(name) {
  const base =
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "community";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

// Load caller's membership row (or null). The single source of truth for "am I
// in this community" — authorization is always checked here, never assumed.
async function getMembership(communityId, userId) {
  return CommunityMember.findOne({ community: communityId, user: userId });
}

const serializeCommunity = (c, membership) => ({
  _id: c._id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  type: c.type,
  owner: c.owner,
  avatar: c.avatar,
  cover: c.cover,
  membersCount: c.membersCount,
  createdAt: c.createdAt,
  myRole: membership?.role || null,
  isMember: !!membership,
});

// ── CREATE ────────────────────────────────────────────────────
export const createCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { name, description = "", type = "public", avatar, cover } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Community name is required" });
    }
    if (!["public", "private"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid community type" });
    }

    let community;
    await session.withTransaction(async () => {
      // Community + owner membership are created together so a community always
      // has exactly one owner member.
      const [created] = await Community.create(
        [{
          name: name.trim(),
          slug: slugify(name),
          description: description.trim(),
          type,
          owner: req.user._id,
          avatar: avatar || null,
          cover: cover || null,
          membersCount: 1,
        }],
        { session }
      );
      await CommunityMember.create(
        [{ community: created._id, user: req.user._id, role: "owner" }],
        { session }
      );
      community = created;
    });

    await community.populate("owner", "name username avatar");
    res.status(201).json({ success: true, community: serializeCommunity(community, { role: "owner" }) });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};

// ── SEARCH (public communities) ───────────────────────────────
export const searchCommunities = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    if (q.length < 1) return res.json({ success: true, communities: [] });

    const prefix = escapeRegex(q);
    // Both public and private communities are discoverable by name. Only the
    // metadata (name, member count, description) is exposed here — the chat and
    // member list stay locked for non-members of a private community (see
    // getCommunity), so a user can find a private community and request to join.
    const communities = await Community.find({
      name: { $regex: prefix, $options: "i" },
    })
      .populate("owner", "name username avatar")
      .sort({ membersCount: -1 })
      .limit(20)
      .read(analyticsReadPreference())
      .lean();

    // Annotate with my membership so the UI can show Join vs Open.
    const ids = communities.map((c) => c._id);
    const mine = await CommunityMember.find({ community: { $in: ids }, user: req.user._id })
      .select("community role")
      .lean();
    const roleByCommunity = new Map(mine.map((m) => [String(m.community), m.role]));

    res.json({
      success: true,
      communities: communities.map((c) =>
        serializeCommunity(c, roleByCommunity.has(String(c._id)) ? { role: roleByCommunity.get(String(c._id)) } : null)
      ),
    });
  } catch (err) {
    next(err);
  }
};

// ── MY COMMUNITIES (joined) ───────────────────────────────────
export const getMyCommunities = async (req, res, next) => {
  try {
    const memberships = await CommunityMember.find({ user: req.user._id })
      .populate({
        path: "community",
        select: "name slug description type owner avatar membersCount createdAt",
        populate: { path: "owner", select: "name username avatar" },
      })
      .sort({ updatedAt: -1 })
      .read(analyticsReadPreference())
      .lean();

    const communities = memberships
      .filter((m) => m.community) // guard against deleted communities
      .map((m) => serializeCommunity(m.community, { role: m.role }));

    // Split into owned vs joined for the two lists the UI shows.
    const owned = communities.filter((c) => c.myRole === "owner");
    const joined = communities.filter((c) => c.myRole !== "owner");

    res.json({ success: true, owned, joined, communities });
  } catch (err) {
    next(err);
  }
};

// ── GET ONE ───────────────────────────────────────────────────
export const getCommunity = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Community not found" });
    }
    const community = await Community.findById(req.params.id).populate("owner", "name avatar username").lean();
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });

    const membership = await getMembership(community._id, req.user._id);

    // Private communities: only members can see the details/chat.
    if (community.type === "private" && !membership) {
      // Still tell the client it's private + whether they have a pending request.
      const pending = await JoinRequest.findOne({ community: community._id, user: req.user._id, status: "pending" });
      return res.json({
        success: true,
        community: serializeCommunity(community, null),
        locked: true,
        requested: !!pending,
      });
    }

    res.json({ success: true, community: serializeCommunity(community, membership), locked: false });
  } catch (err) {
    next(err);
  }
};

// ── JOIN (public) ─────────────────────────────────────────────
export const joinCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });
    if (community.type === "private") {
      return res.status(403).json({ success: false, message: "This community is private — send a join request" });
    }
    const existing = await getMembership(community._id, req.user._id);
    if (existing) return res.status(409).json({ success: false, message: "Already a member" });

    await session.withTransaction(async () => {
      await CommunityMember.create([{ community: community._id, user: req.user._id, role: "member" }], { session });
      await Community.updateOne({ _id: community._id }, { $inc: { membersCount: 1 } }, { session });
    });

    await postSystemMessage(community._id, req.user._id, `${handle(req.user)} joined`);
    res.status(201).json({ success: true, message: "Joined community" });
  } catch (err) {
    // Unique index race → already a member.
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Already a member" });
    next(err);
  } finally {
    session.endSession();
  }
};

// ── REQUEST TO JOIN (private) ─────────────────────────────────
export const requestToJoin = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });
    if (community.type === "public") {
      return res.status(400).json({ success: false, message: "This community is public — just join it" });
    }
    if (await getMembership(community._id, req.user._id)) {
      return res.status(409).json({ success: false, message: "Already a member" });
    }

    let request;
    try {
      request = await JoinRequest.create({
        community: community._id,
        user: req.user._id,
        message: (req.body?.message || "").trim(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: "Request already sent" });
      }
      throw err;
    }

    // Notify the owner (non-blocking).
    try {
      await createNotification({
        recipient: community.owner,
        type: "community_request",
        actor: req.user._id,
        community: community._id,
        request: request._id,
        message: `${req.user.name} requested to join "${community.name}"`,
      });
    } catch (e) {
      console.error("Notification create failed:", e.message);
    }

    res.status(201).json({ success: true, message: "Request sent", request });
  } catch (err) {
    next(err);
  }
};

// ── LIST PENDING REQUESTS (owner/admin) ───────────────────────
export const listRequests = async (req, res, next) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role === "member") {
      return res.status(403).json({ success: false, message: "Only owners/admins can view requests" });
    }
    const requests = await JoinRequest.find({ community: req.params.id, status: "pending" })
      .populate("user", "name avatar username")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

// ── RESPOND TO REQUEST (accept/reject) ────────────────────────
export const respondToRequest = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { action } = req.body || {};
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role === "member") {
      return res.status(403).json({ success: false, message: "Only owners/admins can manage requests" });
    }
    const request = await JoinRequest.findOne({
      _id: req.params.reqId,
      community: req.params.id,
      status: "pending",
    });
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    if (action === "reject") {
      request.status = "rejected";
      await request.save();
      await markRequestNotificationsRead(request._id).catch(() => {});
      return res.json({ success: true, message: "Request rejected" });
    }

    // Accept: add member + bump count + mark request accepted, atomically.
    await session.withTransaction(async () => {
      await CommunityMember.updateOne(
        { community: request.community, user: request.user },
        { $setOnInsert: { role: "member", joinedAt: new Date() } },
        { upsert: true, session }
      );
      await Community.updateOne({ _id: request.community }, { $inc: { membersCount: 1 } }, { session });
      request.status = "accepted";
      await request.save({ session });
    });
    await markRequestNotificationsRead(request._id).catch(() => {});

    const requester = await User.findById(request.user).select("name username");
    await postSystemMessage(request.community, request.user, `${handle(requester)} joined`);

    try {
      const community = await Community.findById(request.community).select("name");
      await createNotification({
        recipient: request.user,
        type: "community_request_accepted",
        actor: req.user._id,
        community: request.community,
        message: `Your request to join "${community?.name || "the community"}" was accepted`,
      });
    } catch (e) {
      console.error("Notification create failed:", e.message);
    }

    res.json({ success: true, message: "Request accepted" });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};

// ── MEMBERS ───────────────────────────────────────────────────
export const getMembers = async (req, res, next) => {
  try {
    if (!(await getMembership(req.params.id, req.user._id))) {
      return res.status(403).json({ success: false, message: "Members only" });
    }
    const members = await CommunityMember.find({ community: req.params.id })
      .populate("user", "name avatar username")
      .sort({ role: 1, joinedAt: 1 })
      .lean();
    res.json({ success: true, members });
  } catch (err) {
    next(err);
  }
};

// ── REMOVE A MEMBER (owner only) ──────────────────────────────
export const removeMember = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const community = await Community.findById(req.params.id).select("owner");
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });
    // Owner-only action.
    if (community.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the owner can remove members" });
    }
    const { userId } = req.params;
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You can't remove yourself" });
    }
    const membership = await CommunityMember.findOne({ community: community._id, user: userId });
    if (!membership) return res.status(404).json({ success: false, message: "Member not found" });
    if (membership.role === "owner") {
      return res.status(400).json({ success: false, message: "The owner can't be removed" });
    }

    await session.withTransaction(async () => {
      await CommunityMember.deleteOne({ _id: membership._id }, { session });
      await Community.updateOne({ _id: community._id }, { $inc: { membersCount: -1 } }, { session });
    });

    const removed = await User.findById(membership.user).select("name username");
    await postSystemMessage(community._id, membership.user, `${handle(removed)} was removed`);
    res.json({ success: true, message: "Member removed" });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};

// ── LEAVE ─────────────────────────────────────────────────────
export const leaveCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) return res.status(404).json({ success: false, message: "You're not a member" });
    if (membership.role === "owner") {
      return res.status(400).json({ success: false, message: "Owners can't leave — delete the community instead" });
    }
    await session.withTransaction(async () => {
      await CommunityMember.deleteOne({ _id: membership._id }, { session });
      await Community.updateOne({ _id: req.params.id }, { $inc: { membersCount: -1 } }, { session });
    });
    await postSystemMessage(req.params.id, req.user._id, `${handle(req.user)} left`);
    res.json({ success: true, message: "Left community" });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE (owner only) ───────────────────────────────────────
export const deleteCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ success: false, message: "Community not found" });
    if (community.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the owner can delete this community" });
    }
    // Remove the community and all dependent data together.
    await session.withTransaction(async () => {
      await Message.deleteMany({ community: community._id }, { session });
      await CommunityMember.deleteMany({ community: community._id }, { session });
      await JoinRequest.deleteMany({ community: community._id }, { session });
      await Community.deleteOne({ _id: community._id }, { session });
    });
    res.json({ success: true, message: "Community deleted" });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};

// Exported for the message controller's membership checks.
export { getMembership };
