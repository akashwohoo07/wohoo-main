import express from "express";
import { protect, optionalAuth } from "../middleware/auth.js";
import { recordPing, recordPageview } from "../controllers/analyticsController.js";

const router = express.Router();

// Pageview beacon — works for anonymous visitors too (acquisition tracking).
router.post("/pageview", optionalAuth, recordPageview);

// Activity heartbeat — logged-in users only.
router.post("/ping", protect, recordPing);

export default router;
