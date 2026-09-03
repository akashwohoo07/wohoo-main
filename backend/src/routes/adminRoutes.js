import express from "express";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { getOverview, listUsers, getUserDetail } from "../controllers/analyticsController.js";

const router = express.Router();

// Every admin route is double-gated: authenticated AND on the ADMIN_EMAILS allowlist.
router.use(protect, requireAdmin);

router.get("/overview", getOverview);
router.get("/users", listUsers);
router.get("/users/:id", getUserDetail);

export default router;
