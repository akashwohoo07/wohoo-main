import mongoose from "mongoose";
import Trip from "../models/Trip.js";
import Wishlist from "../models/Wishlist.js";
import { analyticsReadPreference } from "../config/readPreference.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── DISCOVER: search PUBLIC trips ─────────────────────────────
// GET /api/discover/trips?q=&cursor=<iso>&limit=
// Browse read — tolerates slight staleness, so routed to a replica when enabled.
export const searchPublicTrips = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 40);
    const q = (req.query.q || "").trim();

    const query = { isPublic: true };
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      query.$or = [{ name: rx }, { "destination.name": rx }, { "destination.country": rx }, { "destination.city": rx }];
    }
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }

    const docs = await Trip.find(query)
      .read(analyticsReadPreference())
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("owner", "name avatar username")
      .select("name destination coverPhoto startDate endDate members owner createdAt")
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    res.json({
      success: true,
      trips: page.map((t) => ({
        _id: t._id,
        name: t.name,
        destination: t.destination,
        coverPhoto: t.coverPhoto || "",
        startDate: t.startDate,
        endDate: t.endDate,
        owner: t.owner,
        membersCount: t.members?.length || 1,
        createdAt: t.createdAt,
      })),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── WISHLIST: add (idempotent upsert) ─────────────────────────
export const addWishlist = async (req, res, next) => {
  try {
    const { kind, refId, title } = req.body || {};
    const ALLOWED = ["trip", "place", "restaurant", "hotel", "stay", "activity", "sight"];
    if (!ALLOWED.includes(kind)) {
      return res.status(400).json({ success: false, message: "Invalid item kind" });
    }
    if (!refId || !String(refId).trim()) {
      return res.status(400).json({ success: false, message: "refId is required" });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const set = {
      title: String(title).trim().slice(0, 300),
      subtitle: String(req.body.subtitle || "").slice(0, 300),
      image: String(req.body.image || ""),
      rating: typeof req.body.rating === "number" ? req.body.rating : null,
      lat: typeof req.body.lat === "number" ? req.body.lat : null,
      lng: typeof req.body.lng === "number" ? req.body.lng : null,
      meta: req.body.meta && typeof req.body.meta === "object" ? req.body.meta : {},
    };
    if (kind === "trip" && mongoose.isValidObjectId(refId)) set.trip = refId;

    const item = await Wishlist.findOneAndUpdate(
      { user: req.user._id, kind, refId: String(refId) },
      { $set: set, $setOnInsert: { user: req.user._id, kind, refId: String(refId) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, item });
  } catch (err) {
    // Duplicate under a race — treat as success (idempotent).
    if (err.code === 11000) {
      const item = await Wishlist.findOne({ user: req.user._id, kind: req.body.kind, refId: String(req.body.refId) });
      return res.status(200).json({ success: true, item });
    }
    next(err);
  }
};

// ── WISHLIST: list (newest-first, cursor paginated) ───────────
export const listWishlist = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 60);
    const query = { user: req.user._id };
    if (req.query.kind) query.kind = req.query.kind;
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }
    const docs = await Wishlist.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    res.json({
      success: true,
      items: page,
      // The set of saved refIds, so Discover can render hearts as filled.
      refIds: page.map((d) => d.refId),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── WISHLIST: the caller's saved refIds (for heart state on Discover) ──
export const getWishlistKeys = async (req, res, next) => {
  try {
    const rows = await Wishlist.find({ user: req.user._id }).select("refId").lean();
    res.json({ success: true, refIds: rows.map((r) => r.refId) });
  } catch (err) {
    next(err);
  }
};

// ── WISHLIST: remove (by id OR by refId) ──────────────────────
export const removeWishlist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const filter = mongoose.isValidObjectId(id)
      ? { _id: id, user: req.user._id }
      : { refId: id, user: req.user._id };
    const deleted = await Wishlist.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ success: false, message: "Not in your wishlist" });
    res.json({ success: true, message: "Removed from wishlist" });
  } catch (err) {
    next(err);
  }
};
