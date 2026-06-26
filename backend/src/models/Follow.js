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

// ✅ Unique compound index — prevents duplicate follows at DB level
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// ✅ Fast lookup: all followers of a user
followSchema.index({ following: 1, createdAt: -1 });

// ✅ Fast lookup: all users a person follows
followSchema.index({ follower: 1, createdAt: -1 });

const Follow = mongoose.model("Follow", followSchema);
export default Follow;