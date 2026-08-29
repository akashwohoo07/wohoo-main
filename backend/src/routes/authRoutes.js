import express from "express";
import passport from "passport";
import { googleCallback, refreshAccessToken, logout, getMe } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

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

router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;