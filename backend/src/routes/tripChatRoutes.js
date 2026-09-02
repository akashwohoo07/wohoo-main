import express from "express";
import { protect } from "../middleware/auth.js";
import { listMessages, sendMessage, reactToMessage, deleteMessage } from "../controllers/tripChatController.js";

// mergeParams to read :tripId from the mount path (/api/trips/:tripId/chat).
const router = express.Router({ mergeParams: true });

router.use(protect);

router.get("/", listMessages);
router.post("/", sendMessage);
router.post("/:messageId/react", reactToMessage);
router.delete("/:messageId", deleteMessage);

export default router;
