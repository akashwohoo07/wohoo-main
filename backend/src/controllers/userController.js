import User from "../models/User.js";
import Trip from "../models/Trip.js";
import { sendUsernameConfirmEmail } from "../utils/email.js";

export const setUsername = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: "Username is required" });
    if (!/^[a-z0-9]+$/i.test(username)) {
      return res.status(400).json({ success: false, message: "Username can only contain letters and numbers" });
    }
    if (username.length < 12) {
      return res.status(400).json({ success: false, message: "Username must be at least 12 characters" });
    }
    const user = await User.findById(req.user._id);
    if (user.usernameSetAt) {
      const daysSince = (Date.now() - new Date(user.usernameSetAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        const daysLeft = Math.ceil(30 - daysSince);
        return res.status(429).json({ success: false, message: `You can change your username again in ${daysLeft} day${daysLeft > 1 ? "s" : ""}.` });
      }
    }
    const taken = await User.findOne({ username: username.toLowerCase(), _id: { $ne: user._id } });
    if (taken) return res.status(409).json({ success: false, message: "This username is already taken" });
    user.username = username.toLowerCase();
    user.usernameSetAt = new Date();
    await user.save();
    try { await sendUsernameConfirmEmail({ toEmail: user.email, name: user.name, username: user.username }); } catch {}
    res.json({ success: true, message: "Username set successfully", username: user.username });
  } catch (err) { next(err); }
};

export const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.params;
    if (!username || username.length < 12) return res.json({ available: false, message: "Too short" });
    if (!/^[a-z0-9]+$/i.test(username)) return res.json({ available: false, message: "Invalid characters" });
    const taken = await User.findOne({ username: username.toLowerCase(), _id: { $ne: req.user._id } });
    res.json({ available: !taken, message: taken ? "Username taken" : "Available" });
  } catch (err) { next(err); }
};

// ✅ NEW — Search users by username
export const searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, users: [] });

    const users = await User.find({
      username: { $regex: `^${q}`, $options: "i" },
      _id: { $ne: req.user._id }, // exclude self
    })
      .select("name username avatar")
      .limit(10);

    res.json({ success: true, users });
  } catch (err) { next(err); }
};

// ✅ NEW — Get public profile by username
export const getUserProfile = async (req, res, next) => {
    try {
      const { username } = req.params;
      const profileUser = await User.findOne({ username: username.toLowerCase() })
        .select("name username avatar createdAt followersCount followingCount");
  
      if (!profileUser) return res.status(404).json({ success: false, message: "User not found" });
  
      const publicTrips = await Trip.find({ owner: profileUser._id, isPublic: true })
        .select("name destination coverPhoto startDate endDate status members")
        .populate("members.user", "name avatar")
        .sort({ createdAt: -1 })
        .limit(20);

      await Trip.syncStatuses(publicTrips);

      // ✅ Include follow status in same response — zero extra round trips
      let isFollowing = false;
      if (req.user && req.user._id.toString() !== profileUser._id.toString()) {
        const Follow = (await import("../models/Follow.js")).default;
        const follow = await Follow.findOne({
          follower: req.user._id,
          following: profileUser._id,
        });
        isFollowing = !!follow;
      }
  
      res.json({
        success: true,
        user: profileUser,
        trips: publicTrips,
        isFollowing, // ✅ sent together with profile — one request, complete data
      });
    } catch (err) {
      next(err);
    }
  };