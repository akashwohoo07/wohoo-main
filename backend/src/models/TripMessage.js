import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  { emoji: { type: String, required: true }, users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] },
  { _id: false }
);

// A place (hotel/restaurant/attraction) shared into the trip chat. Stored
// DENORMALIZED on the message so the card renders instantly and we never re-hit
// (or re-bill) the Places API for a place someone already looked up in Explore.
const sharedPlaceSchema = new mongoose.Schema(
  {
    placeId: String,
    name: { type: String, required: true },
    category: String, // "hotel" | "restaurant" | "attraction" | free text
    address: String,
    photo: String,
    rating: Number,
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

// A message in a trip's private discussion chat. Only trip members can read or
// post (enforced in the controller against Trip.members on every request).
const tripMessageSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () { return this.type !== "system"; },
    },
    type: { type: String, enum: ["text", "place_share", "system"], default: "text" },
    text: { type: String, trim: true, maxlength: 4000, default: "" },
    // WhatsApp-style quoted reply.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "TripMessage" },
    sharedPlace: sharedPlaceSchema,
    reactions: { type: [reactionSchema], default: [] },
    deleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// List (newest-first) + cursor pagination.
tripMessageSchema.index({ trip: 1, createdAt: -1 });
// Live poll for reactions/deletions since a timestamp.
tripMessageSchema.index({ trip: 1, updatedAt: -1 });

const TripMessage = mongoose.models.TripMessage || mongoose.model("TripMessage", tripMessageSchema);
export default TripMessage;
