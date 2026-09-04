import mongoose from "mongoose";

// A user's saved items from Discover. Deliberately denormalized: we store a
// display snapshot (title/image/subtitle) so the wishlist renders without
// re-fetching the source (a public trip that later went private, or a Google
// place we'd otherwise pay to look up again). `refId` is the stable key —
// the trip id for kind "trip", or the Google placeId for place kinds.
const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: ["trip", "place", "restaurant", "hotel", "stay", "activity", "sight"],
      required: true,
    },
    refId: { type: String, required: true }, // trip id OR google placeId
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" }, // set when kind === "trip"
    title: { type: String, required: true, maxlength: 300 },
    subtitle: { type: String, default: "", maxlength: 300 },
    image: { type: String, default: "" },
    rating: { type: Number, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// One wishlist row per (user, kind, refId) — saving again is idempotent.
wishlistSchema.index({ user: 1, kind: 1, refId: 1 }, { unique: true });
// Newest-first listing per user.
wishlistSchema.index({ user: 1, createdAt: -1 });

const Wishlist = mongoose.models.Wishlist || mongoose.model("Wishlist", wishlistSchema);
export default Wishlist;
