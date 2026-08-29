// NoSQL-injection protection compatible with Express 5.
//
// Express 5 makes req.query a read-only getter, so we cannot reassign it the
// way express-mongo-sanitize does. Instead we mutate the target objects in
// place, stripping any key that starts with "$" (Mongo operators) or contains
// "." (dotted-path injection). Applied to body, params, and query.

function scrub(obj) {
  if (!obj || typeof obj !== "object") return;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    const value = obj[key];
    if (value && typeof value === "object") scrub(value);
  }
}

export function sanitizeRequest(req, _res, next) {
  scrub(req.body);
  scrub(req.params);
  // req.query is a getter in Express 5 but its underlying object is mutable.
  if (req.query && typeof req.query === "object") scrub(req.query);
  next();
}

// Escape a user-supplied string so it can be used safely inside a RegExp.
// Prevents both regex injection and ReDoS via crafted patterns.
export function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
