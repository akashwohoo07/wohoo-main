import mongoose from "mongoose";
import TripNote from "../models/TripNote.js";
import Checklist from "../models/Checklist.js";
import Trip from "../models/Trip.js";

// Only current trip members can read/write notes & checklists — checked live on
// every request, so leaving/removal cuts access immediately.
async function loadMembership(req, res) {
  const { tripId } = req.params;
  if (!mongoose.isValidObjectId(tripId)) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const trip = await Trip.findById(tripId).select("members owner");
  if (!trip) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const member = trip.members.find((m) => m.user.toString() === req.user._id.toString());
  if (!member) {
    res.status(403).json({ success: false, message: "Only trip members can access this" });
    return null;
  }
  return { trip, member };
}

const isOwner = (ctx, req) => ctx.trip.owner.toString() === req.user._id.toString();

// ── NOTES FEED ────────────────────────────────────────────────
export const listNotes = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const query = { trip: req.params.tripId };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }
    const docs = await TripNote.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("author", "name avatar username")
      .lean();
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    res.json({
      success: true,
      notes: page,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

export const addNote = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Note can't be empty" });
    const note = await TripNote.create({ trip: req.params.tripId, author: req.user._id, text });
    const populated = await note.populate("author", "name avatar username");
    res.status(201).json({ success: true, note: populated });
  } catch (err) {
    next(err);
  }
};

export const deleteNote = async (req, res, next) => {
  try {
    const ctx = await loadMembership(req, res);
    if (!ctx) return;
    const note = await TripNote.findOne({ _id: req.params.noteId, trip: req.params.tripId });
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    // Author, or the trip owner, may delete a note.
    if (note.author.toString() !== req.user._id.toString() && !isOwner(ctx, req)) {
      return res.status(403).json({ success: false, message: "You can't delete this note" });
    }
    await TripNote.deleteOne({ _id: note._id });
    res.json({ success: true, message: "Note deleted" });
  } catch (err) {
    next(err);
  }
};

// ── CHECKLISTS ────────────────────────────────────────────────
export const listChecklists = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const checklists = await Checklist.find({ trip: req.params.tripId })
      .sort({ createdAt: 1 })
      .limit(50)
      .populate("createdBy", "name avatar username")
      .lean();
    res.json({ success: true, checklists });
  } catch (err) {
    next(err);
  }
};

export const createChecklist = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const title = (req.body?.title || "Checklist").trim().slice(0, 120) || "Checklist";
    const items = Array.isArray(req.body?.items)
      ? req.body.items
          .map((i) => (typeof i === "string" ? i : i?.text))
          .filter((t) => t && String(t).trim())
          .slice(0, 100)
          .map((t) => ({ text: String(t).trim().slice(0, 300), done: false }))
      : [];
    const checklist = await Checklist.create({
      trip: req.params.tripId,
      title,
      createdBy: req.user._id,
      items,
    });
    const populated = await checklist.populate("createdBy", "name avatar username");
    res.status(201).json({ success: true, checklist: populated });
  } catch (err) {
    next(err);
  }
};

export const deleteChecklist = async (req, res, next) => {
  try {
    const ctx = await loadMembership(req, res);
    if (!ctx) return;
    const checklist = await Checklist.findOne({ _id: req.params.id, trip: req.params.tripId });
    if (!checklist) return res.status(404).json({ success: false, message: "Checklist not found" });
    if (checklist.createdBy.toString() !== req.user._id.toString() && !isOwner(ctx, req)) {
      return res.status(403).json({ success: false, message: "Only the creator or trip owner can delete this checklist" });
    }
    await Checklist.deleteOne({ _id: checklist._id });
    res.json({ success: true, message: "Checklist deleted" });
  } catch (err) {
    next(err);
  }
};

// Return a checklist populated for the client after a mutation.
async function returnChecklist(id, res) {
  const populated = await Checklist.findById(id).populate("createdBy", "name avatar username").lean();
  res.json({ success: true, checklist: populated });
}

export const addItem = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Item can't be empty" });
    const updated = await Checklist.findOneAndUpdate(
      { _id: req.params.id, trip: req.params.tripId },
      { $push: { items: { text: text.slice(0, 300), done: false } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Checklist not found" });
    await returnChecklist(updated._id, res);
  } catch (err) {
    next(err);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const set = {};
    if (typeof req.body?.done === "boolean") {
      set["items.$.done"] = req.body.done;
      set["items.$.doneBy"] = req.body.done ? req.user._id : null;
    }
    if (typeof req.body?.text === "string" && req.body.text.trim()) {
      set["items.$.text"] = req.body.text.trim().slice(0, 300);
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }
    const updated = await Checklist.findOneAndUpdate(
      { _id: req.params.id, trip: req.params.tripId, "items._id": req.params.itemId },
      { $set: set },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Item not found" });
    await returnChecklist(updated._id, res);
  } catch (err) {
    next(err);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    if (!(await loadMembership(req, res))) return;
    const updated = await Checklist.findOneAndUpdate(
      { _id: req.params.id, trip: req.params.tripId },
      { $pull: { items: { _id: req.params.itemId } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Checklist not found" });
    await returnChecklist(updated._id, res);
  } catch (err) {
    next(err);
  }
};
