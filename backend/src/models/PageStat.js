import mongoose from "mongoose";

// Flexible first-party web-analytics rollup. One tiny doc per (day, kind, key),
// incremented atomically — so pageviews, top paths, traffic sources and device
// splits are all tracked in a single collection with zero unbounded event rows.
//   kind "total"   key "all"         -> total pageviews that day
//   kind "path"    key "/trips/:id"  -> views of a (normalized) route
//   kind "source"  key "google.com"  -> referrer host / utm source ("direct" if none)
//   kind "device"  key "mobile"      -> device bucket
const pageStatSchema = new mongoose.Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    kind: { type: String, required: true, enum: ["total", "path", "source", "device", "country", "city"] },
    key: { type: String, required: true },
    count: { type: Number, default: 0 },
    // Only for kind "city": approx coordinates + a display label for map pins.
    lat: Number,
    lng: Number,
    label: String,
  },
  { timestamps: true }
);

pageStatSchema.index({ day: 1, kind: 1, key: 1 }, { unique: true });
pageStatSchema.index({ kind: 1, day: 1 }); // top-N aggregations over a window

const PageStat = mongoose.models.PageStat || mongoose.model("PageStat", pageStatSchema);
export default PageStat;
