import mongoose from "mongoose";

// One participant's resolved share of an expense. `owed` is the source of truth
// for all balance math and is stored in integer minor units (paise/cents) so
// sums are always exact. It is computed server-side (never trusted from the
// client) via utils/splits.js and always satisfies: sum(owed) === expense.amount.
const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owed: { type: Number, required: true, min: 0 }, // minor units
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    // Short required heading for the expense (e.g. "Dinner at Baga").
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Optional longer detail.
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    // Total amount in integer minor units (paise). Enforced > 0.
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR", uppercase: true, maxlength: 3 },
    // Single payer per expense (the common Splitwise case).
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    splitMethod: {
      type: String,
      enum: ["equal", "exact", "percentage", "shares"],
      default: "equal",
    },
    participants: {
      type: [participantSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, "At least one participant is required"],
    },
    category: { type: String, trim: true, maxlength: 40, default: "" },
    // When the expense actually happened (may differ from createdAt).
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// List within a trip, newest first — also serves createdAt cursor pagination.
expenseSchema.index({ trip: 1, createdAt: -1 });
// Per-user drill-down: "expenses this user is a participant of".
expenseSchema.index({ trip: 1, "participants.user": 1 });
// Balance aggregation reads paidBy heavily.
expenseSchema.index({ trip: 1, paidBy: 1 });

const Expense = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
export default Expense;
