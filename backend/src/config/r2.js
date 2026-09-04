import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 (S3-compatible object storage) for user-uploaded images.
// Uploads go browser → R2 directly via presigned URLs, so file bytes never
// pass through this app tier (scales horizontally; no upload bottleneck).
// Entirely optional: if the env isn't set, uploads return 503 and nothing
// else is affected.
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL, // e.g. https://cdn.wohoo.in  (public bucket domain)
} = process.env;

export const r2Configured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL
);

export const R2_BUCKET_NAME = R2_BUCKET;
// Public base used to build the stored image URL (served via Cloudflare CDN).
export const R2_PUBLIC_BASE = (R2_PUBLIC_URL || "").replace(/\/+$/, "");

// Lazily created so importing this file never throws when R2 isn't configured.
let _client = null;
export function getR2() {
  if (!r2Configured) return null;
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return _client;
}
