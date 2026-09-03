// Admin is defined by an env allowlist (ADMIN_EMAILS, comma-separated) — never a
// DB flag a user could flip. Set it as a Fly secret per environment. Fail closed.
export function isAdminEmail(email) {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

// Use AFTER `protect` (needs req.user). 403 for anyone not on the allowlist.
export function requireAdmin(req, res, next) {
  if (!req.user || !isAdminEmail(req.user.email)) {
    return res.status(403).json({ success: false, message: "Admin access only" });
  }
  next();
}
