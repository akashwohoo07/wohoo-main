import express from "express";
import { protect } from "../middleware/auth.js";
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
} from "../controllers/followController.js";

const router = express.Router();

router.use(protect);

router.post("/:userId/follow", followUser);
router.delete("/:userId/follow", unfollowUser);
router.get("/:userId/followers", getFollowers);
router.get("/:userId/following", getFollowing);
router.get("/:userId/follow-status", getFollowStatus);

export default router;