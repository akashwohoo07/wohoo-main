import mongoose from "mongoose";

// One emoji reaction bucket on a message: the emoji + who reacted with it.
// Embedded (not a separate collection) because reactions are read on the exact
// same access path as the message and are bounded per message — so they cost
// zero extra queries and stay consistent with the message doc.
const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false }
);

// A chat message in a community. `type` distinguishes a plain text message from
// a shared trip (which renders as a minimal trip card on the client), an image,
// and system notices (e.g. "X joined"). `mentions` holds resolved @user ids for
// fast "tagged you" lookups and notifications.
const messageSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: "Community", required: true, index: true },
    // System messages are authored by the app, but we still store the subject
    // user (who joined/left) for rendering — so sender is only required for
    // human message types.
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () { return this.type !== "system"; },
    },
    type: { type: String, enum: ["text", "trip_share", "image", "system"], default: "text" },
    text: { type: String, trim: true, maxlength: 4000, default: "" },
    sharedTrip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    imageUrl: { type: String }, // for type: "image" (served from object storage)
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reactions: { type: [reactionSchema], default: [] },
    // Soft delete: the doc is kept but its content is hidden and a tombstone
    // is shown. `deletedByAdmin` drives "deleted by admin" vs "message deleted".
    // Lets deletions propagate to other clients via the `updatedAt` poll below.
    deleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Message list (newest-first) + createdAt cursor pagination.
messageSchema.index({ community: 1, createdAt: -1 });
// Lets pollers pick up messages deleted/reacted since a timestamp.
messageSchema.index({ community: 1, updatedAt: -1 });

const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
export default Message;
