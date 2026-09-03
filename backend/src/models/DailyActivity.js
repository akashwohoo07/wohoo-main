import mongoose from "mongoose";

// One rollup document per (user, day) — NOT one row per event. Time-on-site is
// accumulated with an atomic $inc on activeSeconds from client heartbeats, so we
// can track engagement for any number of users cheaply (a few writes/min/user,
// one small doc/user/day). Total time = sum(activeSeconds); DAU = distinct users
// with a doc on a given day.
const dailyActivitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true }, // "YYYY-MM-DD" (UTC)
    activeSeconds: { type: Number, default: 0, min: 0 },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One rollup per user per day (also the upsert key).
dailyActivitySchema.index({ user: 1, day: 1 }, { unique: true });
// Daily/DAU aggregations across all users.
dailyActivitySchema.index({ day: 1 });

const DailyActivity =
  mongoose.models.DailyActivity || mongoose.model("DailyActivity", dailyActivitySchema);
export default DailyActivity;
