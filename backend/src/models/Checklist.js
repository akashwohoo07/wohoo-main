import mongoose from "mongoose";

// Items are embedded (a checklist is a bounded document) and keep their own _id
// so we can toggle/edit/delete a single item atomically with positional updates.
const checklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300 },
    // COMMON scope: shared done flag (e.g. "ticket booking" — done for everyone).
    done: { type: Boolean, default: false },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // INDIVIDUAL scope: each member ticks for themselves (e.g. "raincoat" — one
    // person ticking it doesn't tick it for the others). Item is "done for me"
    // when my id is in this array.
    checkedBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  },
  { _id: true, timestamps: true }
);

const checklistSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    title: { type: String, trim: true, maxlength: 120, default: "Checklist" },
    // "common" = one shared tick state; "individual" = per-member tick state.
    scope: { type: String, enum: ["common", "individual"], default: "common" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [checklistItemSchema], default: [] },
  },
  { timestamps: true }
);

// A trip's checklists, oldest-first.
checklistSchema.index({ trip: 1, createdAt: 1 });

const Checklist = mongoose.models.Checklist || mongoose.model("Checklist", checklistSchema);
export default Checklist;
