import express from "express";
import { protect } from "../middleware/auth.js";
import { recordPing } from "../controllers/analyticsController.js";

const router = express.Router();

router.use(protect);
// Client activity heartbeat (any logged-in user).
router.post("/ping", recordPing);

export default router;
