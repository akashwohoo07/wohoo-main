import mongoose from "mongoose";
import DailyActivity from "../models/DailyActivity.js";
import PageStat from "../models/PageStat.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import Community from "../models/Community.js";
import Message from "../models/Message.js";
import TripMessage from "../models/TripMessage.js";

const dayStr = (d = new Date()) => d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const startOfTodayUTC = () => new Date(dayStr() + "T00:00:00.000Z");
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

// ── PING (any authenticated user) ─────────────────────────────
// Client heartbeat while the tab is active. Atomic $inc into the (user, day)
// rollup — cheap and safe under concurrency.
export const recordPing = async (req, res, next) => {
  try {
    const seconds = Math.min(Math.max(parseInt(req.body?.seconds, 10) || 60, 1), 300);
    await DailyActivity.updateOne(
      { user: req.user._id, day: dayStr() },
      { $inc: { activeSeconds: seconds }, $set: { lastSeenAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    // Never let analytics break the app; swallow duplicate-key upsert races.
    if (err.code === 11000) return res.json({ success: true });
    next(err);
  }
};

// ── PAGEVIEW (anonymous or authed) ────────────────────────────
const OWN_HOSTS = ["wohoo.in", "www.wohoo.in", "api.wohoo.in", "localhost", "127.0.0.1"];

// Normalize a path so ids/usernames/tokens don't explode the key space (also
// strips PII like usernames out of analytics).
function normalizePath(p) {
  if (!p || typeof p !== "string") return "/";
  let path = p.split("?")[0].split("#")[0];
  path = path
    .replace(/\/trips\/[a-f0-9]{24}/i, "/trips/:id")
    .replace(/\/communities\/[a-f0-9]{24}/i, "/communities/:id")
    .replace(/\/u\/[^/]+/i, "/u/:username")
    .replace(/\/invite\/[^/]+/i, "/invite/:token")
    .replace(/\/[a-f0-9]{24}/gi, "/:id");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path.slice(0, 120) || "/";
}

function sourceOf(referrer, utm) {
  if (utm) return String(utm).toLowerCase().slice(0, 60);
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    if (OWN_HOSTS.includes(host) || host.endsWith(".workers.dev")) return "direct"; // internal nav
    return host.slice(0, 60);
  } catch {
    return "direct";
  }
}

export const recordPageview = async (req, res, next) => {
  try {
    const day = dayStr();
    const path = normalizePath(req.body?.path);
    const device = ["mobile", "tablet", "desktop"].includes(req.body?.device) ? req.body.device : "desktop";
    const source = sourceOf(req.body?.referrer, req.body?.utm);
    const upsert = (kind, key) => ({
      updateOne: { filter: { day, kind, key }, update: { $inc: { count: 1 } }, upsert: true },
    });
    await PageStat.bulkWrite([
      upsert("total", "all"),
      upsert("path", path),
      upsert("device", device),
      upsert("source", source),
    ]);
    res.json({ success: true });
  } catch (err) {
    // Analytics must never break navigation; swallow (incl. upsert races).
    res.json({ success: true });
  }
};

// ── ADMIN: OVERVIEW ───────────────────────────────────────────
export const getOverview = async (req, res, next) => {
  try {
    const today = dayStr();
    const since30 = daysAgo(30);
    const since30Day = dayStr(daysAgo(30));
    const since7Day = dayStr(daysAgo(7));
    const topN = (kind) => PageStat.aggregate([
      { $match: { kind, day: { $gte: since7Day } } },
      { $group: { _id: "$key", count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    const [
      totalUsers, usersToday, users7d,
      activeToday, totalTrips, totalCommunities, communityMsgs, tripMsgs,
      signupSeries, activeSeries, timeTodayAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfTodayUTC() } }),
      User.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
      DailyActivity.countDocuments({ day: today }),            // distinct users active today
      Trip.countDocuments(),
      Community.countDocuments(),
      Message.countDocuments(),
      TripMessage.countDocuments(),
      User.aggregate([
        { $match: { createdAt: { $gte: since30 } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      DailyActivity.aggregate([
        { $match: { day: { $gte: since30Day } } },
        { $group: { _id: "$day", seconds: { $sum: "$activeSeconds" }, users: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      DailyActivity.aggregate([
        { $match: { day: today } },
        { $group: { _id: null, seconds: { $sum: "$activeSeconds" } } },
      ]),
    ]);

    // Traffic (first-party): today's pageviews + top pages/sources/devices (7d).
    const [pvToday, topPaths, topSources, devices] = await Promise.all([
      PageStat.findOne({ day: today, kind: "total", key: "all" }).lean(),
      topN("path"),
      topN("source"),
      topN("device"),
    ]);

    res.json({
      success: true,
      totals: {
        users: totalUsers,
        usersToday,
        users7d,
        activeToday,
        avgMinutesTodayPerActive: activeToday ? Math.round((timeTodayAgg[0]?.seconds || 0) / activeToday / 60) : 0,
        trips: totalTrips,
        communities: totalCommunities,
        messages: communityMsgs + tripMsgs,
      },
      signupsPerDay: signupSeries.map((d) => ({ day: d._id, count: d.count })),
      activityPerDay: activeSeries.map((d) => ({ day: d._id, minutes: Math.round(d.seconds / 60), users: d.users })),
      traffic: {
        pageviewsToday: pvToday?.count || 0,
        topPaths: topPaths.map((r) => ({ key: r._id, count: r.count })),
        topSources: topSources.map((r) => ({ key: r._id, count: r.count })),
        devices: devices.map((r) => ({ key: r._id, count: r.count })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: USER LIST (cursor paginated) ───────────────────────
export const listUsers = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const q = (req.query.q || "").trim();
    const query = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: rx }, { email: rx }, { username: rx }];
    }
    if (req.query.cursor) {
      const c = new Date(req.query.cursor);
      if (!isNaN(c)) query.createdAt = { $lt: c };
    }

    const docs = await User.find(query)
      .select("name email username avatar createdAt")
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const ids = page.map((u) => u._id);

    // Enrich the page (bounded set) with activity totals + trips owned.
    const [activity, trips] = await Promise.all([
      DailyActivity.aggregate([
        { $match: { user: { $in: ids } } },
        { $group: { _id: "$user", totalSeconds: { $sum: "$activeSeconds" }, lastSeenAt: { $max: "$lastSeenAt" } } },
      ]),
      Trip.aggregate([
        { $match: { owner: { $in: ids } } },
        { $group: { _id: "$owner", count: { $sum: 1 } } },
      ]),
    ]);
    const actMap = new Map(activity.map((a) => [String(a._id), a]));
    const tripMap = new Map(trips.map((t) => [String(t._id), t.count]));

    res.json({
      success: true,
      users: page.map((u) => ({
        ...u,
        totalMinutes: Math.round((actMap.get(String(u._id))?.totalSeconds || 0) / 60),
        lastSeenAt: actMap.get(String(u._id))?.lastSeenAt || null,
        tripsOwned: tripMap.get(String(u._id)) || 0,
      })),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: SINGLE USER DETAIL ─────────────────────────────────
export const getUserDetail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const user = await User.findById(req.params.id).select("name email username avatar createdAt followersCount followingCount").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const [series, totalAgg, tripsOwned, communities] = await Promise.all([
      DailyActivity.find({ user: user._id, day: { $gte: dayStr(daysAgo(30)) } }).sort({ day: 1 }).lean(),
      DailyActivity.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(user._id) } },
        { $group: { _id: null, seconds: { $sum: "$activeSeconds" }, lastSeenAt: { $max: "$lastSeenAt" } } },
      ]),
      Trip.countDocuments({ owner: user._id }),
      Trip.countDocuments({ "members.user": user._id }),
    ]);

    res.json({
      success: true,
      user,
      totalMinutes: Math.round((totalAgg[0]?.seconds || 0) / 60),
      lastSeenAt: totalAgg[0]?.lastSeenAt || null,
      tripsOwned,
      tripsJoined: communities,
      activityPerDay: series.map((d) => ({ day: d.day, minutes: Math.round(d.activeSeconds / 60) })),
    });
  } catch (err) {
    next(err);
  }
};
