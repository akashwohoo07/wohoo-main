import mongoose from "mongoose";

// One authored note in a trip's shared notes feed. Kept in its own collection
// (not embedded on Trip) so the feed is cursor-paginated and scales.
const tripNoteSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true }
);

// Feed (newest-first) + createdAt cursor pagination.
tripNoteSchema.index({ trip: 1, createdAt: -1 });

const TripNote = mongoose.models.TripNote || mongoose.model("TripNote", tripNoteSchema);
export default TripNote;
