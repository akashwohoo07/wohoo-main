import mongoose from "mongoose";

// Items are embedded (a checklist is a bounded document) and keep their own _id
// so we can toggle/edit/delete a single item atomically with positional updates.
const checklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300 },
    done: { type: Boolean, default: false },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true, timestamps: true }
);

const checklistSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    title: { type: String, trim: true, maxlength: 120, default: "Checklist" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [checklistItemSchema], default: [] },
  },
  { timestamps: true }
);

// A trip's checklists, oldest-first.
checklistSchema.index({ trip: 1, createdAt: 1 });

const Checklist = mongoose.models.Checklist || mongoose.model("Checklist", checklistSchema);
export default Checklist;
