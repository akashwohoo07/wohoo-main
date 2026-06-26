import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createTrip,
  getMyTrips,
  getTrip,
  updateTrip,
  updateItinerary,
  togglePrivacy,
  inviteMember,
  getMyInvitations,
  respondToInvitation,
} from "../controllers/tripController.js";

const router = express.Router();

router.use(protect);

// ✅ Specific routes FIRST — before /:id
router.get("/", getMyTrips);
router.post("/", createTrip);
router.get("/invitations", getMyInvitations);
router.post("/invitations/:token/respond", respondToInvitation);

router.get("/invitations/:token", async (req, res, next) => {
  try {
    const Invitation = (await import("../models/Invitation.js")).default;
    const invite = await Invitation.findOne({ token: req.params.token, status: "pending" })
      .populate("trip", "name destination coverPhoto startDate endDate")
      .populate("invitedBy", "name avatar");
    if (!invite) return res.status(404).json({ success: false, message: "Invitation not found or already used" });
    if (invite.expiresAt < new Date()) return res.status(410).json({ success: false, message: "Invitation has expired" });
    res.json({ success: true, invite });
  } catch (err) {
    next(err);
  }
});

// ✅ Dynamic routes LAST
router.get("/:id", getTrip);
router.put("/:id", updateTrip);
router.put("/:id/itinerary", updateItinerary);
router.patch("/:id/privacy", togglePrivacy);
router.post("/:id/invite", inviteMember);

export default router;