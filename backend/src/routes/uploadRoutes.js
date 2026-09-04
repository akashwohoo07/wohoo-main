import express from "express";
import { protect } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimiter.js";
import { presignUpload, confirmUpload, removeImage } from "../controllers/uploadController.js";

const router = express.Router();

router.use(protect);

// Mint a short-lived direct-to-R2 upload URL, then confirm/save it.
router.post("/presign", uploadLimiter, presignUpload);
router.post("/confirm", confirmUpload);
router.delete("/:kind", removeImage);

export default router;
