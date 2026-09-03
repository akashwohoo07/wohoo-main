// The admin panel lives at an obscure, build-time-configurable path so it isn't
// guessable and isn't linked anywhere for non-admins. Set VITE_ADMIN_PATH at
// build to keep the real slug out of the source repo entirely.
//
// NOTE: the actual security boundary is server-side — /api/admin/* requires the
// caller's email to be on ADMIN_EMAILS (requireAdmin). This path is only for
// privacy/obscurity, not authorization.
export const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || "admin";
