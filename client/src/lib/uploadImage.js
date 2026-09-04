import api from "../api/axios";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = { avatar: 5 * 1024 * 1024, cover: 10 * 1024 * 1024 };

// Upload an image directly to R2 (browser → R2), then save it on the user.
// Flow: presign (backend) → PUT the bytes straight to R2 → confirm (backend
// validates size/type and stores the URL). The file never passes through our
// API server, so many concurrent uploads don't bottleneck it.
export async function uploadImage(file, kind, onProgress) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size > (MAX_BYTES[kind] || MAX_BYTES.avatar)) {
    const mb = Math.round((MAX_BYTES[kind] || MAX_BYTES.avatar) / (1024 * 1024));
    throw new Error(`Image is too large (max ${mb} MB).`);
  }

  // 1) Ask our backend for a short-lived signed URL.
  const { data: sig } = await api.post("/uploads/presign", { kind, contentType: file.type });

  // 2) PUT the file straight to R2. Plain XHR (NOT our axios instance) so no
  //    auth cookies are sent to R2, and we get upload progress.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sig.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });

  // 3) Confirm — backend HEADs the object, enforces size/type, saves the URL.
  const { data } = await api.post("/uploads/confirm", { kind, key: sig.key });
  return data.url;
}
