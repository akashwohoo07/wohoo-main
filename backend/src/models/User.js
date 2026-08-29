import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: 12,
      maxlength: 30,
      match: [/^[a-z0-9]+$/, "Username can only contain letters and numbers"],
      index: true,
    },
    usernameSetAt: Date,
    googleId: { type: String, unique: true, sparse: true, index: true },
    avatar: String,
    isVerified: { type: Boolean, default: false },
    refreshToken: { type: String, select: false },
    // ✅ Denormalized counts — O(1) reads, updated atomically
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;