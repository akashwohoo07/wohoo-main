import express from "express";
import { protect, optionalAuth } from "../middleware/auth.js";
import { setUsername, checkUsername, searchUsers, getUserProfile } from "../controllers/userController.js";

const router = express.Router();

// Public — no auth needed
router.get("/profile/:username", optionalAuth, getUserProfile);

// Protected
router.use(protect);
router.post("/username", setUsername);
router.get("/username/check/:username", checkUsername);
router.get("/search", searchUsers);

export default router;