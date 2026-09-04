import mongoose from "mongoose";

// In-app (website) notifications. Kept deliberately small and denormalized with
// a `message` string so the notification list renders without extra joins, while
// still carrying refs (actor/trip/invitation/token) for actionable items like
// "accept invite" or "view trip".
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "trip_invite",
        "invite_accepted",
        "invite_declined",
        // Community events
        "mention",
        "community_request",
        "community_request_accepted",
        "community_join",
      ],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who triggered it
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    community: { type: mongoose.Schema.Types.ObjectId, ref: "Community" },
    // For community_request: the JoinRequest, so the owner can accept/reject
    // straight from the notification.
    request: { type: mongoose.Schema.Types.ObjectId, ref: "JoinRequest" },
    invitation: { type: mongoose.Schema.Types.ObjectId, ref: "Invitation" },
    token: { type: String }, // invitation token, for one-click accept from the bell
    role: { type: String, enum: ["editor", "viewer"] },
    message: { type: String, required: true, maxlength: 300 },
    // Actionable notifications (trip_invite, community_request) carry a status so
    // the UI knows whether to still show Accept/Reject. Once handled anywhere
    // (the bell OR the community/trip page) it flips to accepted/rejected and the
    // buttons are replaced by the resolved message. Non-actionable ones leave it
    // unset.
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: undefined },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Bell list (newest-first) + cursor pagination.
notificationSchema.index({ recipient: 1, createdAt: -1 });
// Unread-count badge.
notificationSchema.index({ recipient: 1, read: 1 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
