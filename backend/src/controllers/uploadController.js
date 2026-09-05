import crypto from "crypto";
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import User from "../models/User.js";
import { getR2, r2Configured, R2_BUCKET_NAME, R2_PUBLIC_BASE } from "../config/r2.js";

// Image kinds users can upload and their server-enforced size caps (bytes).
// Server-side size backstop on the (already compressed) uploaded object. The
// browser compresses to a few hundred KB before uploading, so this is a safety
// ceiling, not the everyday limit. 25 MB matches the client's original-file cap.
const KINDS = {
  avatar: { field: "avatar", maxBytes: 25 * 1024 * 1024 },
  cover:  { field: "cover",  maxBytes: 25 * 1024 * 1024 },
  // Uncropped originals — same buckets/limits, stored so the crop can be redone.
  avatarOriginal: { field: "avatarOriginal", maxBytes: 25 * 1024 * 1024 },
  coverOriginal:  { field: "coverOriginal",  maxBytes: 25 * 1024 * 1024 },
};
// Only real image types (whitelist, not user-trusted). ext is what we store.
const CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PRESIGN_TTL = 120; // seconds — the browser must finish uploading quickly.

// Where in the bucket a user's images live. Server-controlled so a user can
// never write to another user's prefix or overwrite arbitrary keys.
const prefixFor = (kind, userId) => `${kind}s/${userId}/`;

// ── PRESIGN: hand the browser a short-lived direct-to-R2 upload URL ──────────
// POST /api/uploads/presign  { kind, contentType }
export const presignUpload = async (req, res, next) => {
  try {
    if (!r2Configured) {
      return res.status(503).json({ success: false, error: "uploads_unconfigured", message: "Image uploads are not configured on the server." });
    }
    const { kind, contentType } = req.body || {};
    if (!KINDS[kind]) {
      return res.status(400).json({ success: false, message: "Invalid image kind" });
    }
    const ext = CONTENT_TYPES[contentType];
    if (!ext) {
      return res.status(400).json({ success: false, message: "Only JPEG, PNG or WebP images are allowed" });
    }

    // Random, server-generated key under the caller's own prefix.
    const key = `${prefixFor(kind, req.user._id)}${crypto.randomUUID()}.${ext}`;

    // The signature binds the exact ContentType — the browser must send it and
    // can't store something else under this URL.
    const uploadUrl = await getSignedUrl(
      getR2(),
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: contentType }),
      { expiresIn: PRESIGN_TTL }
    );

    res.json({ success: true, uploadUrl, key, contentType, expiresIn: PRESIGN_TTL });
  } catch (err) {
    next(err);
  }
};

// Best-effort delete of a previous image we hosted (avoid orphan buildup).
async function deleteIfOurs(url) {
  if (!url || !R2_PUBLIC_BASE || !url.startsWith(R2_PUBLIC_BASE + "/")) return;
  const key = url.slice(R2_PUBLIC_BASE.length + 1);
  try { await getR2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })); } catch { /* ignore */ }
}

// ── CONFIRM: verify the uploaded object, then save its URL on the user ───────
// POST /api/uploads/confirm  { kind, key }
export const confirmUpload = async (req, res, next) => {
  try {
    if (!r2Configured) {
      return res.status(503).json({ success: false, error: "uploads_unconfigured" });
    }
    const { kind, key } = req.body || {};
    const spec = KINDS[kind];
    if (!spec) return res.status(400).json({ success: false, message: "Invalid image kind" });
    // AuthZ: the key MUST live under this user's own prefix (they can only
    // confirm what they just uploaded, never claim someone else's object).
    if (typeof key !== "string" || !key.startsWith(prefixFor(kind, req.user._id))) {
      return res.status(403).json({ success: false, message: "That upload isn't yours" });
    }

    // Verify the object really exists and is within our type/size limits. This
    // is where we enforce the max size (a presigned PUT can't cap it up front).
    let head;
    try {
      head = await getR2().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    } catch {
      return res.status(400).json({ success: false, message: "Upload not found — please try again" });
    }
    if (!String(head.ContentType || "").startsWith("image/") || !CONTENT_TYPES[head.ContentType]) {
      await deleteIfOurs(`${R2_PUBLIC_BASE}/${key}`);
      return res.status(400).json({ success: false, message: "File must be an image" });
    }
    if ((head.ContentLength || 0) > spec.maxBytes) {
      await deleteIfOurs(`${R2_PUBLIC_BASE}/${key}`);
      const mb = Math.round(spec.maxBytes / (1024 * 1024));
      return res.status(400).json({ success: false, message: `Image is too large (max ${mb} MB)` });
    }

    const publicUrl = `${R2_PUBLIC_BASE}/${key}`;
    const previous = req.user[spec.field];

    await User.findByIdAndUpdate(req.user._id, { [spec.field]: publicUrl });
    // Clean up the image this one replaced (after the DB points at the new one).
    if (previous && previous !== publicUrl) deleteIfOurs(previous);

    res.json({ success: true, url: publicUrl, kind });
  } catch (err) {
    next(err);
  }
};

// ── REMOVE: clear an avatar/cover ────────────────────────────────────────────
// DELETE /api/uploads/:kind
export const removeImage = async (req, res, next) => {
  try {
    const spec = KINDS[req.params.kind];
    if (!spec) return res.status(400).json({ success: false, message: "Invalid image kind" });
    const previous = req.user[spec.field];
    await User.findByIdAndUpdate(req.user._id, { [spec.field]: "" });
    if (previous) deleteIfOurs(previous);
    res.json({ success: true, kind: req.params.kind });
  } catch (err) {
    next(err);
  }
};
