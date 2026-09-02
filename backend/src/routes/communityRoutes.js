import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createCommunity,
  searchCommunities,
  getMyCommunities,
  getCommunity,
  joinCommunity,
  requestToJoin,
  listRequests,
  respondToRequest,
  getMembers,
  removeMember,
  leaveCommunity,
  deleteCommunity,
} from "../controllers/communityController.js";
import { listMessages, sendMessage, deleteMessage, reactToMessage, searchMessages, markCommunityRead } from "../controllers/messageController.js";

const router = express.Router();

router.use(protect);

// Specific routes before dynamic /:id
router.get("/search", searchCommunities);
router.get("/mine", getMyCommunities);

router.post("/", createCommunity);

// Chat
router.get("/:id/messages/search", searchMessages);
router.get("/:id/messages", listMessages);
router.post("/:id/messages", sendMessage);
router.post("/:id/messages/:messageId/react", reactToMessage);
router.delete("/:id/messages/:messageId", deleteMessage);
router.patch("/:id/read", markCommunityRead);

// Membership & requests
router.get("/:id/members", getMembers);
router.delete("/:id/members/:userId", removeMember);
router.post("/:id/join", joinCommunity);
router.post("/:id/request", requestToJoin);
router.get("/:id/requests", listRequests);
router.post("/:id/requests/:reqId/respond", respondToRequest);
router.post("/:id/leave", leaveCommunity);

router.get("/:id", getCommunity);
router.delete("/:id", deleteCommunity);

export default router;
