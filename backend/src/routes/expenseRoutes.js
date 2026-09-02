import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createExpense,
  listExpenses,
  getBalances,
  getUserBreakdown,
  updateExpense,
  deleteExpense,
} from "../controllers/expenseController.js";

// mergeParams lets this nested router read :tripId from the mount path
// (/api/trips/:tripId/expenses).
const router = express.Router({ mergeParams: true });

router.use(protect);

// Specific routes before dynamic /:id
router.get("/balances", getBalances);
router.get("/user/:userId", getUserBreakdown);

router.get("/", listExpenses);
router.post("/", createExpense);

router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
