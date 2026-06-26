import Follow from "../models/Follow.js";
import User from "../models/User.js";
import mongoose from "mongoose";

// ── FOLLOW ────────────────────────────────────────────────────
export const followUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const followerId = req.user._id;
    const followingId = new mongoose.Types.ObjectId(req.params.userId);

    if (followerId.toString() === followingId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "You cannot follow yourself" });
    }

    const targetUser = await User.findById(followingId).session(session);
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check already following
    const existing = await Follow.findOne({ follower: followerId, following: followingId }).session(session);
    if (existing) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, message: "Already following this user", isFollowing: true });
    }

    // Create follow document
    await Follow.create([{ follower: followerId, following: followingId }], { session });

    // ✅ Atomic increment — simple $inc, no aggregation pipeline needed
    await User.findByIdAndUpdate(followingId, { $inc: { followersCount: 1 } }, { session, new: true });
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } }, { session, new: true });

    await session.commitTransaction();

    // Return updated counts
    const updatedTarget = await User.findById(followingId).select("followersCount followingCount");
    const updatedSelf = await User.findById(followerId).select("followersCount followingCount");

    res.json({
      success: true,
      message: "Followed successfully",
      isFollowing: true,
      followersCount: updatedTarget.followersCount,
      followingCount: updatedSelf.followingCount,
    });
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Already following this user", isFollowing: true });
    }
    next(err);
  } finally {
    session.endSession();
  }
};

// ── UNFOLLOW ──────────────────────────────────────────────────
export const unfollowUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const followerId = req.user._id;
    const followingId = new mongoose.Types.ObjectId(req.params.userId);

    const deleted = await Follow.findOneAndDelete(
      { follower: followerId, following: followingId },
      { session }
    );

    if (!deleted) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "You are not following this user", isFollowing: false });
    }

    // ✅ Simple $inc with -1, then enforce minimum 0 separately
    await User.findByIdAndUpdate(
      followingId,
      { $inc: { followersCount: -1 } },
      { session, new: true }
    );
    await User.findByIdAndUpdate(
      followerId,
      { $inc: { followingCount: -1 } },
      { session, new: true }
    );

    // Ensure counts never go below 0
    await User.updateOne({ _id: followingId, followersCount: { $lt: 0 } }, { $set: { followersCount: 0 } }, { session });
    await User.updateOne({ _id: followerId, followingCount: { $lt: 0 } }, { $set: { followingCount: 0 } }, { session });

    await session.commitTransaction();

    const updatedTarget = await User.findById(followingId).select("followersCount followingCount");
    const updatedSelf = await User.findById(followerId).select("followersCount followingCount");

    res.json({
      success: true,
      message: "Unfollowed successfully",
      isFollowing: false,
      followersCount: updatedTarget.followersCount,
      followingCount: updatedSelf.followingCount,
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ── GET FOLLOWERS ─────────────────────────────────────────────
export const getFollowers = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { cursor, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const query = { following: userId };
    if (cursor) query.createdAt = { $lt: new Date(cursor) };

    const follows = await Follow.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) + 1)
      .populate("follower", "name username avatar followersCount followingCount");

    const hasMore = follows.length > parseInt(limit);
    if (hasMore) follows.pop();

    const nextCursor = hasMore ? follows[follows.length - 1].createdAt : null;

    res.json({
      success: true,
      followers: follows.map((f) => f.follower).filter(Boolean),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET FOLLOWING ─────────────────────────────────────────────
export const getFollowing = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { cursor, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const query = { follower: userId };
    if (cursor) query.createdAt = { $lt: new Date(cursor) };

    const follows = await Follow.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) + 1)
      .populate("following", "name username avatar followersCount followingCount");

    const hasMore = follows.length > parseInt(limit);
    if (hasMore) follows.pop();

    const nextCursor = hasMore ? follows[follows.length - 1].createdAt : null;

    res.json({
      success: true,
      following: follows.map((f) => f.following).filter(Boolean),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
};

// ── CHECK FOLLOW STATUS ───────────────────────────────────────
export const getFollowStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const follow = await Follow.findOne({
      follower: req.user._id,
      following: userId,
    });

    const targetUser = await User.findById(userId).select("followersCount followingCount");

    res.json({
      success: true,
      isFollowing: !!follow,
      followersCount: targetUser?.followersCount || 0,
      followingCount: targetUser?.followingCount || 0,
    });
  } catch (err) {
    next(err);
  }
};