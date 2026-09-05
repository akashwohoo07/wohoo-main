import crypto from "crypto";
import mongoose from "mongoose";
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import Trip from "../models/Trip.js";
import TripFile from "../models/TripFile.js";
import { getR2, filesConfigured, R2_FILES_BUCKET_NAME } from "../config/r2.js";

// Accepted document types + which per-trip quota they count against, and the ext
// stored in the key. "any image + pdf".
const ACCEPTED = {
  "application/pdf": { category: "pdf", ext: "pdf" },
  "image/jpeg": { category: "image", ext: "jpg" },
  "image/png": { category: "image", ext: "png" },
  "image/webp": { category: "image", ext: "webp" },
  "image/gif": { category: "image", ext: "gif" },
  "image/heic": { category: "image", ext: "heic" },
};
// Per-trip limits: 10 PDFs (≤5 MB), 10 images (≤10 MB).
const LIMITS = {
  pdf: { max: 10, maxBytes: 5 * 1024 * 1024 },
  image: { max: 10, maxBytes: 10 * 1024 * 1024 },
};
const PRESIGN_TTL = 120;   // upload URL life (seconds)

const prefixFor = (tripId) => `trips/${tripId}/`;

// Load the trip + caller's membership. 404/403 + null on failure.
async function loadTripForMember(req, res) {
  const { tripId } = req.params;
  if (!mongoose.isValidObjectId(tripId)) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const trip = await Trip.findById(tripId).select("owner members filesEditorsCanUpload");
  if (!trip) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const member = trip.members.find((m) => m.user.toString() === req.user._id.toString());
  if (!member) {
    res.status(403).json({ success: false, message: "Access denied" });
    return null;
  }
  return { trip, member };
}

// Owner always; editors only if the toggle is on; viewers never.
const canUpload = (trip, member) =>
  member.role === "owner" || (member.role === "editor" && trip.filesEditorsCanUpload);

const isOwner = (trip, userId) => trip.owner.toString() === String(userId);

const serializeFile = (f, meId) => ({
  _id: f._id,
  name: f.name,
  category: f.category,
  contentType: f.contentType,
  size: f.size,
  visibility: f.visibility,
  uploadedBy: f.uploadedBy,
  mine: String(f.uploadedBy?._id || f.uploadedBy) === String(meId),
  createdAt: f.createdAt,
});

// ── PRESIGN (upload direct to the private bucket) ─────────────
export const presignFile = async (req, res, next) => {
  try {
    if (!filesConfigured) return res.status(503).json({ success: false, error: "uploads_unconfigured" });
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (!canUpload(ctx.trip, ctx.member)) {
      return res.status(403).json({ success: false, message: "You don't have permission to upload files to this trip" });
    }
    const spec = ACCEPTED[req.body?.contentType];
    if (!spec) return res.status(400).json({ success: false, message: "Only PDFs and images are allowed" });

    const count = await TripFile.countDocuments({ trip: req.params.tripId, category: spec.category });
    if (count >= LIMITS[spec.category].max) {
      return res.status(400).json({ success: false, message: `Limit reached — max ${LIMITS[spec.category].max} ${spec.category}s per trip` });
    }

    const key = `${prefixFor(req.params.tripId)}${crypto.randomUUID()}.${spec.ext}`;
    const uploadUrl = await getSignedUrl(
      getR2(),
      new PutObjectCommand({ Bucket: R2_FILES_BUCKET_NAME, Key: key, ContentType: req.body.contentType }),
      { expiresIn: PRESIGN_TTL }
    );
    res.json({ success: true, uploadUrl, key, category: spec.category, expiresIn: PRESIGN_TTL });
  } catch (err) {
    next(err);
  }
};

const del = (key) => getR2().send(new DeleteObjectCommand({ Bucket: R2_FILES_BUCKET_NAME, Key: key })).catch(() => {});

// ── CONFIRM (validate the object, save metadata) ──────────────
export const confirmFile = async (req, res, next) => {
  try {
    if (!filesConfigured) return res.status(503).json({ success: false, error: "uploads_unconfigured" });
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (!canUpload(ctx.trip, ctx.member)) {
      return res.status(403).json({ success: false, message: "You don't have permission to upload files to this trip" });
    }
    const { key, name, contentType } = req.body || {};
    const spec = ACCEPTED[contentType];
    if (!spec) return res.status(400).json({ success: false, message: "Only PDFs and images are allowed" });
    if (typeof key !== "string" || !key.startsWith(prefixFor(req.params.tripId))) {
      return res.status(400).json({ success: false, message: "Invalid upload" });
    }
    if (!name || !String(name).trim()) {
      await del(key);
      return res.status(400).json({ success: false, message: "Please give the file a name" });
    }
    const visibility = req.body.visibility === "private" ? "private" : "members";

    // Quota re-check (guards a race between presign and confirm).
    const count = await TripFile.countDocuments({ trip: req.params.tripId, category: spec.category });
    if (count >= LIMITS[spec.category].max) {
      await del(key);
      return res.status(400).json({ success: false, message: `Limit reached — max ${LIMITS[spec.category].max} ${spec.category}s per trip` });
    }

    // Verify the uploaded object exists and is within type/size limits.
    let head;
    try {
      head = await getR2().send(new HeadObjectCommand({ Bucket: R2_FILES_BUCKET_NAME, Key: key }));
    } catch {
      return res.status(400).json({ success: false, message: "Upload not found — please try again" });
    }
    if (head.ContentType !== contentType) { await del(key); return res.status(400).json({ success: false, message: "File type mismatch" }); }
    if ((head.ContentLength || 0) > LIMITS[spec.category].maxBytes) {
      await del(key);
      const mb = Math.round(LIMITS[spec.category].maxBytes / (1024 * 1024));
      return res.status(400).json({ success: false, message: `${spec.category === "pdf" ? "PDF" : "Image"} is too large (max ${mb} MB)` });
    }

    const file = await TripFile.create({
      trip: req.params.tripId,
      uploadedBy: req.user._id,
      name: String(name).trim().slice(0, 120),
      key,
      contentType,
      size: head.ContentLength || 0,
      category: spec.category,
      visibility,
    });
    await file.populate("uploadedBy", "name username avatar");
    res.status(201).json({ success: true, file: serializeFile(file, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// ── LIST (files the caller may see) ───────────────────────────
export const listFiles = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    // Members-visible files + your own private ones. (A private file is only ever
    // visible to its uploader — not even the trip owner.)
    const files = await TripFile.find({
      trip: req.params.tripId,
      $or: [{ visibility: "members" }, { uploadedBy: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate("uploadedBy", "name username avatar")
      .lean();

    const [pdf, image] = await Promise.all([
      TripFile.countDocuments({ trip: req.params.tripId, category: "pdf" }),
      TripFile.countDocuments({ trip: req.params.tripId, category: "image" }),
    ]);

    res.json({
      success: true,
      files: files.map((f) => serializeFile(f, req.user._id)),
      counts: { pdf, image },
      limits: { pdf: LIMITS.pdf.max, image: LIMITS.image.max },
      canUpload: canUpload(ctx.trip, ctx.member),
      isOwner: isOwner(ctx.trip, req.user._id),
      editorsCanUpload: !!ctx.trip.filesEditorsCanUpload,
    });
  } catch (err) {
    next(err);
  }
};

// ── STREAM FILE (view / download) ─────────────────────────────
// Streams the bytes through us instead of handing out a signable R2 URL. Every
// request re-checks auth + trip membership + visibility, so there is NO shareable
// link: a member can't forward a working URL to a non-member (they'd hit this
// endpoint without a valid session/membership and get 401/403).
export const streamFile = async (req, res, next) => {
  try {
    if (!filesConfigured) return res.status(503).json({ success: false, error: "uploads_unconfigured" });
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return; // non-members are rejected here (403)
    const file = await TripFile.findOne({ _id: req.params.fileId, trip: req.params.tripId });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    // Private → only the uploader.
    if (file.visibility === "private" && file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You don't have access to this file" });
    }

    let obj;
    try {
      obj = await getR2().send(new GetObjectCommand({ Bucket: R2_FILES_BUCKET_NAME, Key: file.key }));
    } catch {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const inline = req.query.inline === "1" || req.query.inline === "true";
    const ext = file.key.slice(file.key.lastIndexOf(".")) || "";
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    const filename = safeName.includes(".") ? safeName : `${safeName}${ext}`;

    res.setHeader("Content-Type", obj.ContentType || file.contentType);
    // Use the actual object length from R2 (must match the bytes we stream).
    if (obj.ContentLength != null) res.setHeader("Content-Length", obj.ContentLength);
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
    // Never let a shared/cached copy be reused without re-auth.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const body = obj.Body instanceof Readable ? obj.Body : Readable.from(obj.Body);
    body.on("error", () => { if (!res.headersSent) res.status(500); res.end(); });
    body.pipe(res);
  } catch (err) {
    next(err);
  }
};

// ── UPDATE (rename / change visibility) — uploader only ───────
export const updateFile = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    const file = await TripFile.findOne({ _id: req.params.fileId, trip: req.params.tripId });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the uploader can edit this file" });
    }
    if (typeof req.body.name === "string") {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ success: false, message: "Name can't be empty" });
      file.name = name.slice(0, 120);
    }
    if (req.body.visibility === "members" || req.body.visibility === "private") {
      file.visibility = req.body.visibility;
    }
    await file.save();
    await file.populate("uploadedBy", "name username avatar");
    res.json({ success: true, file: serializeFile(file, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// ── DELETE — uploader or trip owner ───────────────────────────
export const deleteFile = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    const file = await TripFile.findOne({ _id: req.params.fileId, trip: req.params.tripId });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    const mayDelete = file.uploadedBy.toString() === req.user._id.toString() || isOwner(ctx.trip, req.user._id);
    if (!mayDelete) return res.status(403).json({ success: false, message: "You can't delete this file" });

    await TripFile.deleteOne({ _id: file._id });
    del(file.key); // best-effort R2 cleanup
    res.json({ success: true, message: "File deleted" });
  } catch (err) {
    next(err);
  }
};

// ── FILES SETTING (editors-can-upload) — owner only ───────────
export const updateFilesSettings = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (!isOwner(ctx.trip, req.user._id)) {
      return res.status(403).json({ success: false, message: "Only the owner can change this" });
    }
    ctx.trip.filesEditorsCanUpload = !!req.body.editorsCanUpload;
    await ctx.trip.save();
    res.json({ success: true, editorsCanUpload: ctx.trip.filesEditorsCanUpload });
  } catch (err) {
    next(err);
  }
};
