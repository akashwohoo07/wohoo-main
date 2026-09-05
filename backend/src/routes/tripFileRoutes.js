import express from "express";
import { protect } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimiter.js";
import {
  presignFile,
  confirmFile,
  listFiles,
  getFileLink,
  updateFile,
  deleteFile,
  updateFilesSettings,
} from "../controllers/tripFileController.js";

// mergeParams so this nested router can read :tripId from the mount path
// (/api/trips/:tripId/files).
const router = express.Router({ mergeParams: true });

router.use(protect);

router.get("/", listFiles);
router.post("/presign", uploadLimiter, presignFile);
router.post("/confirm", confirmFile);
router.patch("/settings", updateFilesSettings);
router.get("/:fileId/link", getFileLink);
router.patch("/:fileId", updateFile);
router.delete("/:fileId", deleteFile);

export default router;
