// Pure split arithmetic for the Expenses/Splits feature.
//
// ALL money here is handled in integer minor units (paise/cents). Working in
// integers is what makes splits exact and bug-free: floating point can never
// make three people owe 33.333… — instead we distribute the indivisible last
// paise deterministically with the largest-remainder method.
//
// The API layer converts rupees <-> paise at the boundary (see expenseController).

export const toMinor = (n) => Math.round(Number(n) * 100);
export const toMajor = (m) => Math.round(m) / 100;

export const SPLIT_METHODS = ["equal", "exact", "percentage", "shares"];

/**
 * Distribute `total` (integer minor units) across `weights` proportionally,
 * guaranteeing the parts sum to `total` exactly. Leftover minor units from
 * rounding go to the participants with the largest fractional remainder
 * (largest-remainder / Hamilton method) — deterministic and fair.
 *
 * @param {number} total   integer minor units to distribute (>= 0)
 * @param {number[]} weights non-negative weights, at least one > 0
 * @returns {number[]} integer minor units, same length as weights, summing to total
 */
export function distributeByWeights(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (!(sumW > 0)) throw new Error("Split weights must sum to a positive value");

  const raw = weights.map((w) => (total * w) / sumW);
  const floors = raw.map(Math.floor);
  const distributed = floors.reduce((a, b) => a + b, 0);
  let remainder = total - distributed; // 0 <= remainder < weights.length

  // Rank by fractional part desc; ties broken by original index for determinism.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = floors.slice();
  for (let k = 0; k < remainder; k++) result[order[k].i] += 1;
  return result;
}

/**
 * Resolve the per-participant owed amounts for an expense.
 *
 * @param {object}   opts
 * @param {number}   opts.amountMinor  total expense in minor units (> 0)
 * @param {string}   opts.method       one of SPLIT_METHODS
 * @param {Array<{user:string, value?:number}>} opts.participants
 *        value meaning by method:
 *          equal      -> ignored
 *          exact      -> that user's owed amount in MAJOR units (rupees)
 *          percentage -> that user's percentage (0..100), must total 100
 *          shares     -> that user's integer share weight (> 0)
 * @returns {Array<{user:string, owed:number}>} owed in minor units, summing to amountMinor
 */
export function computeSplits({ amountMinor, method, participants }) {
  if (!SPLIT_METHODS.includes(method)) {
    throw new SplitError(`Invalid split method "${method}"`);
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new SplitError("At least one participant is required");
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new SplitError("Expense amount must be greater than zero");
  }

  // Reject duplicate participants — otherwise a user could be double-charged.
  const seen = new Set();
  for (const p of participants) {
    const id = String(p.user);
    if (seen.has(id)) throw new SplitError("Duplicate participant in split");
    seen.add(id);
  }

  let owed;

  if (method === "equal") {
    owed = distributeByWeights(amountMinor, participants.map(() => 1));
  } else if (method === "shares") {
    const weights = participants.map((p) => Number(p.value));
    if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
      throw new SplitError("Shares must be non-negative numbers");
    }
    owed = distributeByWeights(amountMinor, weights);
  } else if (method === "percentage") {
    const pcts = participants.map((p) => Number(p.value));
    if (pcts.some((v) => !Number.isFinite(v) || v < 0)) {
      throw new SplitError("Percentages must be non-negative numbers");
    }
    // Sum must be 100 (allow tiny float tolerance on the user-entered %).
    const sum = pcts.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new SplitError(`Percentages must add up to 100 (got ${sum})`);
    }
    owed = distributeByWeights(amountMinor, pcts);
  } else {
    // exact: values are the actual owed amounts in rupees.
    owed = participants.map((p) => toMinor(p.value));
    if (owed.some((v) => !Number.isInteger(v) || v < 0)) {
      throw new SplitError("Exact amounts must be non-negative");
    }
    const sum = owed.reduce((a, b) => a + b, 0);
    if (sum !== amountMinor) {
      throw new SplitError(
        `Split amounts (${toMajor(sum)}) must add up to the total (${toMajor(amountMinor)})`
      );
    }
  }

  return participants.map((p, i) => ({ user: String(p.user), owed: owed[i] }));
}

/**
 * Greedy debt settlement: turn a set of net balances into a minimal-ish list of
 * "who pays whom". Nets are in minor units; must sum to ~0. Returns transfers in
 * minor units. Standard cash-flow-minimisation greedy (match biggest creditor
 * with biggest debtor). Deterministic given the input order.
 *
 * @param {Array<{user:string, net:number}>} balances net minor units (>0 owed to them)
 * @returns {Array<{from:string, to:string, amount:number}>}
 */
export function settleBalances(balances) {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ user: b.user, amt: b.net }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ user: b.user, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt);

  const transfers = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const give = Math.min(creditors[ci].amt, debtors[di].amt);
    if (give > 0) {
      transfers.push({ from: debtors[di].user, to: creditors[ci].user, amount: give });
    }
    creditors[ci].amt -= give;
    debtors[di].amt -= give;
    if (creditors[ci].amt === 0) ci++;
    if (debtors[di].amt === 0) di++;
  }
  return transfers;
}

// Typed error so the controller can map split problems to HTTP 400.
export class SplitError extends Error {
  constructor(message) {
    super(message);
    this.name = "SplitError";
    this.statusCode = 400;
  }
}
