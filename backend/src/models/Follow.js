import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// ✅ Unique compound index — prevents duplicate follows at DB level AND serves
// the O(1) follow-status check (Follow.findOne({follower, following})).
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Cursor-paginated lists sort by _id desc within a user — these compound
// indexes let Mongo satisfy both the equality match and the sort from the index.
// ✅ Fast lookup: all followers of a user (paginated by _id)
followSchema.index({ following: 1, _id: -1 });

// ✅ Fast lookup: all users a person follows (paginated by _id)
followSchema.index({ follower: 1, _id: -1 });

const Follow = mongoose.models.Follow || mongoose.model("Follow", followSchema);
export default Follow;