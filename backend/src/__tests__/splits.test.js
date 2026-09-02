import { describe, it, expect } from "vitest";
import {
  computeSplits,
  distributeByWeights,
  settleBalances,
  toMinor,
  toMajor,
  SplitError,
} from "../utils/splits.js";

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

describe("distributeByWeights", () => {
  it("splits evenly when divisible", () => {
    expect(distributeByWeights(9000, [1, 1, 1])).toEqual([3000, 3000, 3000]);
  });

  it("gives leftover paise to largest remainders (100/3 case)", () => {
    // 10000 paise / 3 = 3333.33 -> one participant gets the extra paise
    const parts = distributeByWeights(10000, [1, 1, 1]);
    expect(sum(parts)).toBe(10000);
    expect(parts.filter((p) => p === 3334)).toHaveLength(1);
    expect(parts.filter((p) => p === 3333)).toHaveLength(2);
  });

  it("respects proportional weights and stays exact", () => {
    const parts = distributeByWeights(10000, [1, 2, 1]);
    expect(sum(parts)).toBe(10000);
    expect(parts).toEqual([2500, 5000, 2500]);
  });

  it("throws when weights sum to zero", () => {
    expect(() => distributeByWeights(100, [0, 0])).toThrow();
  });
});

describe("computeSplits — equal", () => {
  it("splits equally and always sums to the total", () => {
    const res = computeSplits({
      amountMinor: 10000,
      method: "equal",
      participants: [{ user: "a" }, { user: "b" }, { user: "c" }],
    });
    expect(sum(res.map((r) => r.owed))).toBe(10000);
    expect(res.map((r) => r.user)).toEqual(["a", "b", "c"]);
  });
});

describe("computeSplits — exact", () => {
  it("accepts exact amounts that sum to the total", () => {
    const res = computeSplits({
      amountMinor: 10000,
      method: "exact",
      participants: [
        { user: "a", value: 60 },
        { user: "b", value: 40 },
      ],
    });
    expect(res).toEqual([
      { user: "a", owed: 6000 },
      { user: "b", owed: 4000 },
    ]);
  });

  it("rejects exact amounts that do not sum to the total", () => {
    expect(() =>
      computeSplits({
        amountMinor: 10000,
        method: "exact",
        participants: [
          { user: "a", value: 60 },
          { user: "b", value: 30 },
        ],
      })
    ).toThrow(SplitError);
  });
});

describe("computeSplits — percentage", () => {
  it("splits by percentage exactly", () => {
    const res = computeSplits({
      amountMinor: 10000,
      method: "percentage",
      participants: [
        { user: "a", value: 25 },
        { user: "b", value: 75 },
      ],
    });
    expect(res).toEqual([
      { user: "a", owed: 2500 },
      { user: "b", owed: 7500 },
    ]);
  });

  it("rejects percentages that do not add up to 100", () => {
    expect(() =>
      computeSplits({
        amountMinor: 10000,
        method: "percentage",
        participants: [
          { user: "a", value: 25 },
          { user: "b", value: 70 },
        ],
      })
    ).toThrow(/100/);
  });

  it("handles indivisible percentage totals exactly", () => {
    const res = computeSplits({
      amountMinor: 10000,
      method: "percentage",
      participants: [
        { user: "a", value: 33.33 },
        { user: "b", value: 33.33 },
        { user: "c", value: 33.34 },
      ],
    });
    expect(sum(res.map((r) => r.owed))).toBe(10000);
  });
});

describe("computeSplits — shares", () => {
  it("splits by integer shares", () => {
    const res = computeSplits({
      amountMinor: 12000,
      method: "shares",
      participants: [
        { user: "a", value: 1 },
        { user: "b", value: 3 },
      ],
    });
    expect(res).toEqual([
      { user: "a", owed: 3000 },
      { user: "b", owed: 9000 },
    ]);
  });
});

describe("computeSplits — validation", () => {
  it("rejects unknown methods", () => {
    expect(() =>
      computeSplits({ amountMinor: 100, method: "wat", participants: [{ user: "a" }] })
    ).toThrow(SplitError);
  });

  it("rejects empty participants", () => {
    expect(() =>
      computeSplits({ amountMinor: 100, method: "equal", participants: [] })
    ).toThrow(SplitError);
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      computeSplits({
        amountMinor: 100,
        method: "equal",
        participants: [{ user: "a" }, { user: "a" }],
      })
    ).toThrow(/Duplicate/);
  });

  it("rejects non-positive amounts", () => {
    expect(() =>
      computeSplits({ amountMinor: 0, method: "equal", participants: [{ user: "a" }] })
    ).toThrow(SplitError);
  });
});

describe("settleBalances", () => {
  it("returns no transfers when everyone is settled", () => {
    expect(settleBalances([{ user: "a", net: 0 }, { user: "b", net: 0 }])).toEqual([]);
  });

  it("matches a single debtor to a single creditor", () => {
    const t = settleBalances([
      { user: "a", net: 5000 },
      { user: "b", net: -5000 },
    ]);
    expect(t).toEqual([{ from: "b", to: "a", amount: 5000 }]);
  });

  it("minimises transfers across multiple parties and conserves money", () => {
    const balances = [
      { user: "a", net: 10000 },
      { user: "b", net: -4000 },
      { user: "c", net: -6000 },
    ];
    const t = settleBalances(balances);
    expect(sum(t.map((x) => x.amount))).toBe(10000);
    // Everyone's net should resolve to zero after applying transfers.
    const final = new Map(balances.map((b) => [b.user, b.net]));
    for (const x of t) {
      final.set(x.from, final.get(x.from) + x.amount);
      final.set(x.to, final.get(x.to) - x.amount);
    }
    for (const v of final.values()) expect(v).toBe(0);
  });
});

describe("money conversion", () => {
  it("round-trips rupees through paise", () => {
    expect(toMinor(123.45)).toBe(12345);
    expect(toMajor(12345)).toBe(123.45);
  });

  it("rounds sub-paise input safely", () => {
    expect(toMinor(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
  });
});
