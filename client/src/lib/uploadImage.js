import imageCompression from "browser-image-compression";
import api from "../api/axios";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = { avatar: 5 * 1024 * 1024, cover: 10 * 1024 * 1024 };

// Resize + recompress on the CLIENT before uploading. Runs in a web worker, so
// it never blocks the UI and puts ZERO load on our server (the server never
// sees the original bytes — they go browser → R2 directly). Quality stays high:
// we only shrink to the size actually displayed and keep quality ~0.85, so it's
// visually indistinguishable while going from megabytes → a few hundred KB.
// Side benefit: re-encoding strips EXIF metadata (incl. GPS location) for privacy.
const COMPRESS = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.6, initialQuality: 0.85 },
  cover: { maxWidthOrHeight: 1600, maxSizeMB: 2, initialQuality: 0.85 },
};

async function compress(file, kind) {
  // Only compress raster images we can decode; if anything goes wrong, fall back
  // to the original so an upload is never blocked by compression.
  try {
    const opts = { ...(COMPRESS[kind] || COMPRESS.avatar), useWebWorker: true, fileType: file.type };
    const out = await imageCompression(file, opts);
    // Never return something bigger than the original.
    return out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

// Upload an image directly to R2, then save it on the user.
// Flow: compress (browser) → presign (backend) → PUT straight to R2 → confirm.
export async function uploadImage(file, kind, onProgress) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }

  // 0) Compress/resize on-device first (keeps quality, shrinks size).
  const upload = await compress(file, kind);

  // Safety backstop (compressed files are ~KB, so this basically never trips).
  if (upload.size > (MAX_BYTES[kind] || MAX_BYTES.avatar)) {
    const mb = Math.round((MAX_BYTES[kind] || MAX_BYTES.avatar) / (1024 * 1024));
    throw new Error(`Image is too large (max ${mb} MB).`);
  }

  // 1) Ask our backend for a short-lived signed URL (for the compressed type).
  const { data: sig } = await api.post("/uploads/presign", { kind, contentType: upload.type });

  // 2) PUT straight to R2. Plain XHR (NOT our axios instance) so no auth cookies
  //    are sent to R2, and we get upload progress.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sig.uploadUrl);
    xhr.setRequestHeader("Content-Type", upload.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(upload);
  });

  // 3) Confirm — backend HEADs the object, enforces size/type, saves the URL.
  const { data } = await api.post("/uploads/confirm", { kind, key: sig.key });
  return data.url;
}
