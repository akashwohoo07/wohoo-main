import User from "../models/User.js";
import Trip from "../models/Trip.js";
import { dispatchEmail, JOB_USERNAME } from "../queues/emailQueue.js";
import { escapeRegex } from "../middleware/sanitize.js";
import { analyticsReadPreference } from "../config/readPreference.js";
import { cacheGet, cacheSet } from "../utils/cache.js";
import Follow from "../models/Follow.js";
import Community from "../models/Community.js";

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
    try { await dispatchEmail(JOB_USERNAME, { toEmail: user.email, name: user.name, username: user.username }); } catch {}
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

// ── Search users by username (prefix autocomplete) ────────────
// SCALE NOTES:
// • username is stored lowercase, so we lowercase the query and use an ANCHORED
//   prefix regex WITHOUT the `i` flag. A case-insensitive (`i`) regex cannot use
//   the btree index and forces a collection scan — the anchored non-`i` form is
//   served by an index range scan (fast even with millions of users).
// • escapeRegex() prevents regex injection / ReDoS.
// • .lean() skips Mongoose document hydration (big CPU saving on read paths).
// • Results are index-ordered (alphabetical). Popularity/fuzzy ranking at scale
//   belongs in a search engine (Atlas Search / Typesense) — see docs.
export const searchUsers = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ success: true, users: [] });

    const prefix = escapeRegex(q);
    const users = await User.find({
      username: { $regex: `^${prefix}` },
      _id: { $ne: req.user._id }, // exclude self
    })
      .select("name username avatar followersCount")
      .limit(10)
      .read(analyticsReadPreference())
      .lean();

    res.json({ success: true, users });
  } catch (err) { next(err); }
};

// ── Get public profile by username ────────────────────────────
// SCALE NOTES:
// • The viewer-independent part (profile doc + public trips) is cached in Redis
//   for 30s keyed by username, so hot/celebrity profiles don't hammer the DB.
//   Counts are eventually consistent within the TTL — acceptable for social data.
// • isFollowing is per-viewer, so it's always computed fresh (a single indexed
//   Follow.findOne — O(1) via the unique {follower, following} index).
// • .lean() everywhere on this read path.
export const getUserProfile = async (req, res, next) => {
    try {
      const username = req.params.username.toLowerCase();
      const cacheKey = `profile:${username}`;

      let cached = await cacheGet(cacheKey);
      if (!cached) {
        const profileUser = await User.findOne({ username })
          .select("name username avatar createdAt followersCount followingCount")
          .read(analyticsReadPreference())
          .lean();

        if (!profileUser) return res.status(404).json({ success: false, message: "User not found" });

        const publicTrips = await Trip.find({ owner: profileUser._id, isPublic: true })
          .select("name destination coverPhoto startDate endDate status members")
          .populate("members.user", "name avatar")
          .sort({ createdAt: -1 })
          .limit(20)
          .read(analyticsReadPreference())
          .lean();

        Trip.applyComputedStatus(publicTrips);

        // Public communities created by this user (private ones stay hidden).
        const communities = await Community.find({ owner: profileUser._id, type: "public" })
          .select("name slug type avatar membersCount description createdAt")
          .sort({ membersCount: -1 })
          .limit(20)
          .read(analyticsReadPreference())
          .lean();

        cached = { user: profileUser, trips: publicTrips, communities };
        await cacheSet(cacheKey, cached, 30);
      }

      // ✅ Follow status is per-viewer — never cached, single indexed lookup
      let isFollowing = false;
      if (req.user && req.user._id.toString() !== cached.user._id.toString()) {
        const follow = await Follow.findOne({
          follower: req.user._id,
          following: cached.user._id,
        }).lean();
        isFollowing = !!follow;
      }

      res.json({
        success: true,
        user: cached.user,
        trips: cached.trips,
        communities: cached.communities || [],
        isFollowing, // ✅ sent together with profile — one request, complete data
      });
    } catch (err) {
      next(err);
    }
  };