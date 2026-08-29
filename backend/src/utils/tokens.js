import crypto from "crypto";

// Refresh tokens are high-entropy JWTs, so a fast SHA-256 hash is sufficient
// (unlike passwords, which need a slow KDF). Storing only the hash means a
// database leak does not expose usable refresh tokens.
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
