import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { computeSplits, settleBalances, toMinor, toMajor, SplitError } from "../utils/splits.js";

// ── Helpers ───────────────────────────────────────────────────

// Load the trip and the caller's membership. Authorization is explicit here
// (never assumed from the route): only members may touch a trip's expenses.
// Returns { trip, member } or sends the appropriate 404/403 and returns null.
async function loadTripForMember(req, res) {
  const { tripId } = req.params;
  if (!mongoose.isValidObjectId(tripId)) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const trip = await Trip.findById(tripId).select("members");
  if (!trip) {
    res.status(404).json({ success: false, message: "Trip not found" });
    return null;
  }
  const member = trip.members.find((m) => m.user.toString() === req.user._id.toString());
  if (!member) {
    res.status(403).json({ success: false, message: "Access denied" });
    return null;
  }
  return { trip, member };
}

const isMemberId = (trip, id) =>
  trip.members.some((m) => m.user.toString() === String(id));

// Serialize an expense doc/lean object for the client — money back to rupees.
function serializeExpense(e) {
  return {
    _id: e._id,
    trip: e.trip,
    title: e.title,
    description: e.description,
    amount: toMajor(e.amount),
    currency: e.currency,
    paidBy: e.paidBy,
    splitMethod: e.splitMethod,
    participants: (e.participants || []).map((p) => ({
      user: p.user,
      owed: toMajor(p.owed),
    })),
    category: e.category,
    date: e.date,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// Validate the shared expense payload and resolve splits. Throws SplitError
// (400) on any problem. Returns the fields ready to persist (amount in minor).
function buildExpenseFields(body, trip) {
  const { title, description, amount, paidBy, splitMethod = "equal", participants, category, date, currency } = body;

  if (!title || !String(title).trim()) {
    throw new SplitError("Title is required");
  }
  const amountMinor = toMinor(amount);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new SplitError("Amount must be greater than zero");
  }
  if (!paidBy || !isMemberId(trip, paidBy)) {
    throw new SplitError("Payer must be a member of this trip");
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new SplitError("Select at least one person to split with");
  }
  for (const p of participants) {
    if (!p?.user || !isMemberId(trip, p.user)) {
      throw new SplitError("All split participants must be trip members");
    }
  }

  // Resolve per-user owed amounts (exact, sums to total). Throws on bad input.
  const resolved = computeSplits({ amountMinor, method: splitMethod, participants });

  return {
    title: String(title).trim(),
    description: description ? String(description).trim() : "",
    amount: amountMinor,
    currency: currency || "INR",
    paidBy,
    splitMethod,
    participants: resolved,
    category: category ? String(category).trim() : "",
    date: date ? new Date(date) : new Date(),
  };
}

// ── CREATE ────────────────────────────────────────────────────
export const createExpense = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (ctx.member.role === "viewer") {
      return res.status(403).json({ success: false, message: "Viewers cannot add expenses" });
    }

    const fields = buildExpenseFields(req.body, ctx.trip);
    const expense = await Expense.create({
      ...fields,
      trip: req.params.tripId,
      createdBy: req.user._id,
    });

    const populated = await expense.populate([
      { path: "paidBy", select: "name avatar email" },
      { path: "participants.user", select: "name avatar email" },
    ]);
    res.status(201).json({ success: true, expense: serializeExpense(populated) });
  } catch (err) {
    if (err instanceof SplitError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ── LIST (cursor paginated) ───────────────────────────────────
export const listExpenses = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const query = { trip: req.params.tripId };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }

    // Fetch limit + 1 to know whether there's a next page.
    const docs = await Expense.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("paidBy", "name avatar email")
      .populate("participants.user", "name avatar email")
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? page[page.length - 1].createdAt : null;

    res.json({
      success: true,
      expenses: page.map(serializeExpense),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
};

// ── BALANCES + settlement suggestions ─────────────────────────
export const getBalances = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;

    const tripId = new mongoose.Types.ObjectId(req.params.tripId);

    // One round-trip: total paid per payer, and total owed per participant.
    const [agg] = await Expense.aggregate([
      { $match: { trip: tripId } },
      {
        $facet: {
          paid: [{ $group: { _id: "$paidBy", paid: { $sum: "$amount" } } }],
          owed: [
            { $unwind: "$participants" },
            { $group: { _id: "$participants.user", owed: { $sum: "$participants.owed" } } },
          ],
          total: [{ $group: { _id: null, total: { $sum: "$amount" } } }],
        },
      },
    ]);

    const paidMap = new Map(agg.paid.map((r) => [String(r._id), r.paid]));
    const owedMap = new Map(agg.owed.map((r) => [String(r._id), r.owed]));

    // Include every trip member (even zero-activity ones) for a complete view.
    const trip = await Trip.findById(tripId).populate("members.user", "name avatar email").lean();
    const memberIds = new Set(trip.members.map((m) => String(m.user._id)));

    // Money integrity: a user who paid/owes but has since LEFT (or been removed
    // from) the trip still holds real balance. If we dropped them, sums wouldn't
    // reconcile and settlements wouldn't zero out. So union current members with
    // any user still referenced by an expense, flagging the latter as `former`.
    const formerIds = [...new Set([...paidMap.keys(), ...owedMap.keys()])].filter((id) => !memberIds.has(id));
    const formerUsers = formerIds.length
      ? await User.find({ _id: { $in: formerIds } }).select("name avatar email").lean()
      : [];

    const rows = [
      ...trip.members.map((m) => ({ user: m.user, former: false })),
      ...formerUsers.map((u) => ({ user: u, former: true })),
    ];

    const balances = rows.map(({ user, former }) => {
      const id = String(user._id);
      const paid = paidMap.get(id) || 0;
      const owed = owedMap.get(id) || 0;
      return {
        user: { _id: user._id, name: user.name, avatar: user.avatar, email: user.email },
        former,
        paid: toMajor(paid),
        owed: toMajor(owed),
        net: toMajor(paid - owed), // >0 => is owed money, <0 => owes money
        _netMinor: paid - owed,
      };
    });

    const transfers = settleBalances(
      balances.map((b) => ({ user: String(b.user._id), net: b._netMinor }))
    ).map((t) => ({ from: t.from, to: t.to, amount: toMajor(t.amount) }));

    res.json({
      success: true,
      currency: "INR",
      total: toMajor(agg.total[0]?.total || 0),
      balances: balances.map(({ _netMinor, ...b }) => b),
      settlements: transfers,
    });
  } catch (err) {
    next(err);
  }
};

// ── PER-USER BREAKDOWN (the drill-down view) ──────────────────
export const getUserBreakdown = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;

    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId) || !isMemberId(ctx.trip, userId)) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const query = {
      trip: req.params.tripId,
      $or: [{ paidBy: userId }, { "participants.user": userId }],
    };
    if (req.query.cursor) {
      const cursor = new Date(req.query.cursor);
      if (!isNaN(cursor)) query.createdAt = { $lt: cursor };
    }

    const docs = await Expense.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("paidBy", "name avatar email")
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    // For each expense, surface this user's involvement: what they paid vs owed.
    const items = page.map((e) => {
      const mine = e.participants.find((p) => String(p.user) === String(userId));
      const youPaid = String(e.paidBy._id || e.paidBy) === String(userId) ? e.amount : 0;
      const yourShare = mine ? mine.owed : 0;
      return {
        _id: e._id,
        title: e.title,
        description: e.description,
        amount: toMajor(e.amount),
        currency: e.currency,
        paidBy: e.paidBy,
        date: e.date,
        category: e.category,
        yourShare: toMajor(yourShare),
        youPaid: toMajor(youPaid),
        net: toMajor(youPaid - yourShare), // >0 => others owe you from this expense
      };
    });

    res.json({
      success: true,
      items,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── UPDATE ────────────────────────────────────────────────────
export const updateExpense = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (ctx.member.role === "viewer") {
      return res.status(403).json({ success: false, message: "Viewers cannot edit expenses" });
    }

    const expense = await Expense.findOne({ _id: req.params.id, trip: req.params.tripId });
    if (!expense) return res.status(404).json({ success: false, message: "Expense not found" });

    const fields = buildExpenseFields(req.body, ctx.trip);
    Object.assign(expense, fields);
    await expense.save();

    const populated = await expense.populate([
      { path: "paidBy", select: "name avatar email" },
      { path: "participants.user", select: "name avatar email" },
    ]);
    res.json({ success: true, expense: serializeExpense(populated) });
  } catch (err) {
    if (err instanceof SplitError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ── DELETE ────────────────────────────────────────────────────
export const deleteExpense = async (req, res, next) => {
  try {
    const ctx = await loadTripForMember(req, res);
    if (!ctx) return;
    if (ctx.member.role === "viewer") {
      return res.status(403).json({ success: false, message: "Viewers cannot delete expenses" });
    }

    const deleted = await Expense.findOneAndDelete({
      _id: req.params.id,
      trip: req.params.tripId,
    });
    if (!deleted) return res.status(404).json({ success: false, message: "Expense not found" });

    res.json({ success: true, message: "Expense deleted" });
  } catch (err) {
    next(err);
  }
};
