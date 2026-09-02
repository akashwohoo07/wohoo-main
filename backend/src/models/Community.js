import mongoose from "mongoose";

// A community is a group space (public or private) with its own members and chat.
// Membership itself lives in a separate CommunityMember collection so a community
// can scale to thousands of members without an unbounded embedded array.
const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // URL/handle-friendly unique identifier, e.g. "goa-trippers-a1b2".
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    type: { type: String, enum: ["public", "private"], default: "public", index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    avatar: String,
    cover: String,
    // Denormalized for O(1) reads; kept in sync when members join/leave.
    membersCount: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

// Public-community search (prefix match on name).
communitySchema.index({ type: 1, name: 1 });

const Community = mongoose.models.Community || mongoose.model("Community", communitySchema);
export default Community;
