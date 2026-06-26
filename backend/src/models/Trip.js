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
          type: { type: String, enum: ["destination", "heading", "activity"], default: "destination" },
          title: { type: String, default: "" }, // ✅ not required — allow empty while typing
          date: String,
          endDate: String,
          isSubDest: { type: Boolean, default: false },
          placeId: String,
          lat: Number,
          lng: Number,
          region: String,
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

// `status` is only recalculated on save, so a trip nobody touches again will
// keep showing its creation-time status forever (e.g. a finished trip stuck
// under "upcoming"). Call this with any batch of trip docs fetched for
// display to bring stale ones up to date and persist the correction.
tripSchema.statics.syncStatuses = async function (trips) {
  const stale = trips.filter((t) => {
    const computed = computeTripStatus(t.startDate, t.endDate);
    if (!computed || computed === t.status) return false;
    t.status = computed;
    return true;
  });

  if (stale.length) {
    await this.bulkWrite(
      stale.map((t) => ({
        updateOne: { filter: { _id: t._id }, update: { status: t.status } },
      }))
    );
  }

  return trips;
};

tripSchema.index({ "members.user": 1 });
tripSchema.index({ owner: 1, status: 1 });
tripSchema.index({ isPublic: 1, owner: 1 });

const Trip = mongoose.model("Trip", tripSchema);
export default Trip;