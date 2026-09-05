import imageCompression from "browser-image-compression";
import api from "../api/axios";

export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
];
const MAX_BYTES = { pdf: 5 * 1024 * 1024, image: 10 * 1024 * 1024 };

// Upload a trip document to the PRIVATE bucket. Images are compressed in the
// browser (kept readable — up to 2000 px so scanned IDs/tickets stay legible);
// PDFs are stored as-is (browser can't reliably recompress them). Bytes go
// browser → R2 directly via a signed URL; nothing passes through our server.
export async function uploadTripFile(tripId, file, { name, visibility }, onProgress) {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
    throw new Error("Only PDFs and images are allowed.");
  }
  const isPdf = file.type === "application/pdf";
  const category = isPdf ? "pdf" : "image";

  let upload = file;
  if (!isPdf) {
    try {
      const out = await imageCompression(file, {
        maxWidthOrHeight: 2000, // documents need to stay readable
        maxSizeMB: 8,
        initialQuality: 0.85,
        useWebWorker: true,
        fileType: file.type,
      });
      if (out.size < file.size) upload = out;
    } catch { /* fall back to original */ }
  }

  if (upload.size > MAX_BYTES[category]) {
    const mb = Math.round(MAX_BYTES[category] / (1024 * 1024));
    throw new Error(`${isPdf ? "PDF" : "Image"} is too large (max ${mb} MB).`);
  }

  const { data: sig } = await api.post(`/trips/${tripId}/files/presign`, { contentType: upload.type });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sig.uploadUrl);
    xhr.setRequestHeader("Content-Type", upload.type);
    xhr.timeout = 90000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out — please try again."));
    xhr.send(upload);
  });

  const { data } = await api.post(`/trips/${tripId}/files/confirm`, {
    key: sig.key, name, visibility, contentType: upload.type,
  });
  return data.file;
}
