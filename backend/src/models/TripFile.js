import mongoose from "mongoose";

// A document (PDF or image) attached to a trip — tickets, bookings, IDs, etc.
// The bytes live in the PRIVATE R2 bucket (never public); this row holds only
// metadata + the object key. Access is always via short-lived signed URLs after
// an authorization check.
const tripFileSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // User-given display name.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    key: { type: String, required: true }, // object key in the private bucket
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 }, // bytes
    // Which per-trip quota this counts against (10 pdf / 10 image).
    category: { type: String, enum: ["pdf", "image"], required: true },
    // Who can see it: all trip members, or only the uploader.
    visibility: { type: String, enum: ["members", "private"], default: "members", index: true },
  },
  { timestamps: true }
);

// List a trip's files newest-first + count per category for quota checks.
tripFileSchema.index({ trip: 1, createdAt: -1 });
tripFileSchema.index({ trip: 1, category: 1 });

const TripFile = mongoose.models.TripFile || mongoose.model("TripFile", tripFileSchema);
export default TripFile;
