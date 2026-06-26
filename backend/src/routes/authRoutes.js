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
    // ✅ Use function so CLIENT_URL is read at runtime, not at import time
    passport.authenticate("google", {
      failureRedirect: `${process.env.CLIENT_URL}/login`,
      session: false,
    })(req, res, next);
  },
  googleCallback
);

router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;