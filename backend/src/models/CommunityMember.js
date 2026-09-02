import mongoose from "mongoose";

// One row per (community, user). Separate collection (not embedded) so large
// communities stay performant and membership queries are indexed both ways.
const communityMemberSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: "Community", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    // For unread badges: last time this user opened the community chat.
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A user can only be a member once — enforced at the DB layer.
communityMemberSchema.index({ community: 1, user: 1 }, { unique: true });
// "My communities".
communityMemberSchema.index({ user: 1 });

const CommunityMember =
  mongoose.models.CommunityMember || mongoose.model("CommunityMember", communityMemberSchema);
export default CommunityMember;
