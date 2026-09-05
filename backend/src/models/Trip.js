import mongoose from "mongoose";

const tripSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    coverPhoto: String,
    destination: {
      name: { type: String, required: true },
      fullLabel: String,
      placeId: String,
      coordinates: { lat: Number, lng: Number },
      city: String,
      state: String,
      country: String,
    },
    startDate: Date,
    endDate: Date,
    notes: { type: String, default: "" },
    // ✅ Itinerary items
    itinerary: [
        {
          _id: false, // ✅ let MongoDB auto-generate, don't send from frontend
          clientId: String, // ✅ store frontend temp ID here instead
          type: { type: String, enum: ["destination", "heading", "activity", "transport"], default: "destination" },
          title: { type: String, default: "" }, // ✅ not required — allow empty while typing
          date: String,
          endDate: String,
          time: String,
          endTime: String,
          isSubDest: { type: Boolean, default: false },
          placeId: String,
          lat: Number,
          lng: Number,
          region: String,
          price: String,
          currency: String,
          notes: String,
          // transport-leg fields (type === "transport")
          transportMode: String,
          fromStation: String,
          toStation: String,
          fromLat: Number,
          fromLng: Number,
          toLat: Number,
          toLng: Number,
          bookingRef: String,
          order: Number,
        },
      ],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: { type: String, enum: ["owner", "editor", "viewer"], default: "viewer" },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ["upcoming", "ongoing", "past"], default: "upcoming" },
    isPublic: { type: Boolean, default: false, index: true },
    // Files tab: by default only the owner can upload documents. The owner can
    // flip this on to let editors upload too.
    filesEditorsCanUpload: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// Pure date -> status calculation, shared by the pre-save hook and by
// syncStatuses() below. Returns null when there isn't enough info to decide.
export function computeTripStatus(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const now = new Date();
  if (now < startDate) return "upcoming";
  if (now <= endDate) return "ongoing";
  return "past";
}

tripSchema.pre("save", function () {
  const computed = computeTripStatus(this.startDate, this.endDate);
  if (computed) this.status = computed;
});

// Read-path helper: correct the status of already-fetched docs IN MEMORY for
// display, without touching the database. Persistence is handled off the read
// path by the scheduled syncAllStatuses() job.
tripSchema.statics.applyComputedStatus = function (trips) {
  for (const t of trips) {
    const computed = computeTripStatus(t.startDate, t.endDate);
    if (computed) t.status = computed;
  }
  return trips;
};

// Maintenance job: bring every trip's stored `status` in line with the current
// date using three bulk updates. `status` is otherwise only recomputed on save,
// so a trip nobody edits would keep a stale status forever. Run on a schedule
// (BullMQ repeatable job, every 15 min) instead of on the read path.
// `$ne: null` also excludes missing fields, so trips without dates are skipped.
tripSchema.statics.syncAllStatuses = async function () {
  const now = new Date();
  const [past, ongoing, upcoming] = await Promise.all([
    this.updateMany(
      { startDate: { $ne: null }, endDate: { $ne: null, $lt: now }, status: { $ne: "past" } },
      { $set: { status: "past" } }
    ),
    this.updateMany(
      { startDate: { $ne: null, $lte: now }, endDate: { $ne: null, $gte: now }, status: { $ne: "ongoing" } },
      { $set: { status: "ongoing" } }
    ),
    this.updateMany(
      { startDate: { $ne: null, $gt: now }, endDate: { $ne: null }, status: { $ne: "upcoming" } },
      { $set: { status: "upcoming" } }
    ),
  ]);
  return {
    past: past.modifiedCount,
    ongoing: ongoing.modifiedCount,
    upcoming: upcoming.modifiedCount,
  };
};

tripSchema.index({ "members.user": 1 });
tripSchema.index({ owner: 1, status: 1 });
tripSchema.index({ isPublic: 1, owner: 1 });
// Supports the scheduled status-sync bulk queries
tripSchema.index({ status: 1, startDate: 1, endDate: 1 });

const Trip = mongoose.models.Trip || mongoose.model("Trip", tripSchema);
export default Trip;