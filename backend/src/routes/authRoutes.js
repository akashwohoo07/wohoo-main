import express from "express";
import passport from "passport";
import { googleCallback, googleMobileAuth, refreshAccessToken, logout, getMe, authDebug } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Never cache auth responses — prevents browsers from serving a stale OAuth
// redirect (or stale /me) after any config change. Keeps login robust for users.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});

router.get("/google", (req, res, next) => {
  req.session = req.session || {};
  req.session.mode = req.query.mode || "login";
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state: req.query.mode,
  })(req, res, next);
});

router.get(
  "/google/callback",
  (req, res, next) => {
    req.session = req.session || {};
    req.session.mode = req.query.state || "login";
    next();
  },
  (req, res, next) => {
    // Custom callback so we can redirect back to the frontend with a clear reason
    // instead of silently bouncing to /login (bad UX).
    passport.authenticate("google", { session: false }, (err, user) => {
      const client = process.env.CLIENT_URL;
      if (err) return res.redirect(`${client}/login?error=oauth_failed`);
      if (!user) {
        // Most common: login attempt for an account that doesn't exist → guide to sign up.
        const mode = req.session?.mode || "login";
        return res.redirect(
          mode === "login"
            ? `${client}/signup?error=no_account`
            : `${client}/login?error=oauth_failed`
        );
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  googleCallback
);

// Mobile: native Google Sign-In → JWTs in the response body.
router.post("/google/mobile", googleMobileAuth);

router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.get("/debug", authDebug); // TEMP — cookie diagnostic, remove after

export default router;