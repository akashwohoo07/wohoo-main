import mongoose from "mongoose";

// A request to join a PRIVATE community. Owner/admins accept or reject.
const joinRequestSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: "Community", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    message: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true }
);

// Only one pending request per (community, user) — enforced at the DB layer.
joinRequestSchema.index(
  { community: 1, user: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
// Owner/admin listing pending requests for a community.
joinRequestSchema.index({ community: 1, status: 1 });

const JoinRequest = mongoose.models.JoinRequest || mongoose.model("JoinRequest", joinRequestSchema);
export default JoinRequest;
