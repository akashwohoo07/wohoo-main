import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser, createUser } from "./helpers.js";
import Trip from "../models/Trip.js";

const sampleDestination = { name: "Goa", fullLabel: "Goa, India" };

// Build a trip with an owner plus optional extra members. Returns everything
// the tests need (ids + tokens).
async function makeTripWithMembers(memberRoles = []) {
  const owner = await createAuthUser();
  const members = [];
  for (const role of memberRoles) {
    const m = await createAuthUser();
    members.push({ ...m, role });
  }
  const trip = await Trip.create({
    name: "Goa Trip",
    destination: sampleDestination,
    owner: owner.user._id,
    members: [
      { user: owner.user._id, role: "owner" },
      ...members.map((m) => ({ user: m.user._id, role: m.role })),
    ],
  });
  return { owner, members, trip };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe("Expenses API", () => {
  let owner, editor, viewer, trip;

  beforeEach(async () => {
    const setup = await makeTripWithMembers(["editor", "viewer"]);
    owner = setup.owner;
    editor = setup.members[0];
    viewer = setup.members[1];
    trip = setup.trip;
  });

  const base = () => `/api/trips/${trip._id}/expenses`;

  describe("POST create", () => {
    it("creates an equal-split expense (201) and resolves shares exactly", async () => {
      const res = await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "Dinner",
          amount: 100,
          paidBy: owner.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
        });
      expect(res.status).toBe(201);
      expect(res.body.expense.amount).toBe(100);
      const total = res.body.expense.participants.reduce((a, p) => a + p.owed, 0);
      expect(total).toBeCloseTo(100, 5);
    });

    it("creates an exact-split expense", async () => {
      const res = await request(app)
        .post(base())
        .set(auth(editor.token))
        .send({
          title: "Cab",
          amount: 50,
          paidBy: editor.user._id,
          splitMethod: "exact",
          participants: [
            { user: owner.user._id, value: 20 },
            { user: editor.user._id, value: 30 },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.expense.splitMethod).toBe("exact");
    });

    it("rejects exact splits that don't add up (400)", async () => {
      const res = await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "Bad",
          amount: 50,
          paidBy: owner.user._id,
          splitMethod: "exact",
          participants: [
            { user: owner.user._id, value: 20 },
            { user: editor.user._id, value: 20 },
          ],
        });
      expect(res.status).toBe(400);
    });

    it("rejects amount <= 0 (400)", async () => {
      const res = await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({ title: "Free", amount: 0, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(400);
    });

    it("rejects a payer who is not a trip member (400)", async () => {
      const stranger = await createUser();
      const res = await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "X",
          amount: 10,
          paidBy: stranger._id,
          participants: [{ user: owner.user._id }],
        });
      expect(res.status).toBe(400);
    });

    it("rejects a participant who is not a trip member (400)", async () => {
      const stranger = await createUser();
      const res = await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "X",
          amount: 10,
          paidBy: owner.user._id,
          participants: [{ user: stranger._id }],
        });
      expect(res.status).toBe(400);
    });

    it("forbids viewers from adding expenses (403)", async () => {
      const res = await request(app)
        .post(base())
        .set(auth(viewer.token))
        .send({
          title: "Nope",
          amount: 10,
          paidBy: viewer.user._id,
          participants: [{ user: viewer.user._id }],
        });
      expect(res.status).toBe(403);
    });

    it("forbids non-members entirely (403)", async () => {
      const stranger = await createAuthUser();
      const res = await request(app)
        .post(base())
        .set(auth(stranger.token))
        .send({
          title: "Nope",
          amount: 10,
          paidBy: stranger.user._id,
          participants: [{ user: stranger.user._id }],
        });
      expect(res.status).toBe(403);
    });

    it("requires authentication (401)", async () => {
      const res = await request(app).post(base()).send({ title: "x", amount: 1 });
      expect(res.status).toBe(401);
    });

    it("404s for an unknown trip", async () => {
      const res = await request(app)
        .post(`/api/trips/507f1f77bcf86cd799439011/expenses`)
        .set(auth(owner.token))
        .send({ title: "x", amount: 10, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(404);
    });
  });

  describe("GET list", () => {
    it("lists expenses newest-first with pagination", async () => {
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(base())
          .set(auth(owner.token))
          .send({
            title: `E${i}`,
            amount: 30,
            paidBy: owner.user._id,
            participants: [{ user: owner.user._id }, { user: editor.user._id }],
          });
      }
      const res = await request(app).get(`${base()}?limit=2`).set(auth(editor.token));
      expect(res.status).toBe(200);
      expect(res.body.expenses).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeTruthy();

      const page2 = await request(app)
        .get(`${base()}?limit=2&cursor=${encodeURIComponent(res.body.nextCursor)}`)
        .set(auth(editor.token));
      expect(page2.body.expenses).toHaveLength(1);
      expect(page2.body.hasMore).toBe(false);
    });
  });

  describe("GET balances", () => {
    it("computes net balances and settlements that conserve money", async () => {
      // Owner pays 90 split equally 3 ways => each owes 30.
      await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "Hotel",
          amount: 90,
          paidBy: owner.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
        });

      const res = await request(app).get(`${base()}/balances`).set(auth(owner.token));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(90);

      const byId = Object.fromEntries(res.body.balances.map((b) => [b.user._id, b]));
      expect(byId[owner.user._id.toString()].net).toBeCloseTo(60, 5); // paid 90, owes 30
      expect(byId[editor.user._id.toString()].net).toBeCloseTo(-30, 5);
      expect(byId[viewer.user._id.toString()].net).toBeCloseTo(-30, 5);

      // Sum of all nets must be zero.
      const netSum = res.body.balances.reduce((a, b) => a + b.net, 0);
      expect(netSum).toBeCloseTo(0, 5);

      // Settlements: everyone pays the owner.
      const totalTransfer = res.body.settlements.reduce((a, t) => a + t.amount, 0);
      expect(totalTransfer).toBeCloseTo(60, 5);
    });
  });

  describe("GET per-user breakdown", () => {
    it("returns the expenses a member is involved in with their share", async () => {
      await request(app)
        .post(base())
        .set(auth(owner.token))
        .send({
          title: "Lunch",
          amount: 100,
          paidBy: owner.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }],
        });

      const res = await request(app)
        .get(`${base()}/user/${editor.user._id}`)
        .set(auth(editor.token));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].yourShare).toBeCloseTo(50, 5);
      expect(res.body.items[0].youPaid).toBe(0);
      expect(res.body.items[0].net).toBeCloseTo(-50, 5);
    });

    it("404s for a non-member userId", async () => {
      const stranger = await createUser();
      const res = await request(app)
        .get(`${base()}/user/${stranger._id}`)
        .set(auth(owner.token));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT update / DELETE", () => {
    async function createOne(token = owner.token) {
      const res = await request(app)
        .post(base())
        .set(auth(token))
        .send({
          title: "Original",
          amount: 100,
          paidBy: owner.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }],
        });
      return res.body.expense._id;
    }

    it("updates an expense and recomputes splits", async () => {
      const id = await createOne();
      const res = await request(app)
        .put(`${base()}/${id}`)
        .set(auth(editor.token))
        .send({
          title: "Updated",
          amount: 200,
          paidBy: editor.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }],
        });
      expect(res.status).toBe(200);
      expect(res.body.expense.title).toBe("Updated");
      expect(res.body.expense.amount).toBe(200);
      expect(res.body.expense.participants[0].owed).toBe(100);
    });

    it("forbids viewers from updating (403)", async () => {
      const id = await createOne();
      const res = await request(app)
        .put(`${base()}/${id}`)
        .set(auth(viewer.token))
        .send({ title: "x", amount: 10, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(403);
    });

    it("deletes an expense", async () => {
      const id = await createOne();
      const res = await request(app).delete(`${base()}/${id}`).set(auth(owner.token));
      expect(res.status).toBe(200);
      const list = await request(app).get(base()).set(auth(owner.token));
      expect(list.body.expenses).toHaveLength(0);
    });

    it("404s deleting an unknown expense", async () => {
      const res = await request(app)
        .delete(`${base()}/507f1f77bcf86cd799439011`)
        .set(auth(owner.token));
      expect(res.status).toBe(404);
    });
  });

  // ── Split methods end-to-end ────────────────────────────────
  describe("split methods (via API)", () => {
    const post = (body) => request(app).post(base()).set(auth(owner.token)).send(body);

    it("equal split distributes indivisible paise so it sums exactly (100/3)", async () => {
      const res = await post({
        title: "Three-way",
        amount: 100,
        paidBy: owner.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
      });
      expect(res.status).toBe(201);
      const owed = res.body.expense.participants.map((p) => p.owed).sort();
      expect(owed.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
      expect(owed).toEqual([33.33, 33.33, 33.34]);
    });

    it("shares split allocates proportionally", async () => {
      const res = await post({
        title: "By shares",
        amount: 120,
        paidBy: owner.user._id,
        splitMethod: "shares",
        participants: [
          { user: owner.user._id, value: 1 },
          { user: editor.user._id, value: 3 },
        ],
      });
      expect(res.status).toBe(201);
      const byUser = Object.fromEntries(
        res.body.expense.participants.map((p) => [p.user._id, p.owed])
      );
      expect(byUser[owner.user._id.toString()]).toBeCloseTo(30, 5);
      expect(byUser[editor.user._id.toString()]).toBeCloseTo(90, 5);
    });

    it("percentage split allocates by percent", async () => {
      const res = await post({
        title: "By percent",
        amount: 200,
        paidBy: owner.user._id,
        splitMethod: "percentage",
        participants: [
          { user: owner.user._id, value: 25 },
          { user: editor.user._id, value: 75 },
        ],
      });
      expect(res.status).toBe(201);
      const byUser = Object.fromEntries(
        res.body.expense.participants.map((p) => [p.user._id, p.owed])
      );
      expect(byUser[owner.user._id.toString()]).toBeCloseTo(50, 5);
      expect(byUser[editor.user._id.toString()]).toBeCloseTo(150, 5);
    });

    it("rejects percentages that don't total 100 (400)", async () => {
      const res = await post({
        title: "Bad pct",
        amount: 200,
        paidBy: owner.user._id,
        splitMethod: "percentage",
        participants: [
          { user: owner.user._id, value: 25 },
          { user: editor.user._id, value: 70 },
        ],
      });
      expect(res.status).toBe(400);
    });

    it("stores category and defaults currency to INR", async () => {
      const res = await post({
        title: "Groceries",
        amount: 40,
        category: "Food",
        paidBy: owner.user._id,
        participants: [{ user: owner.user._id }],
      });
      expect(res.status).toBe(201);
      expect(res.body.expense.category).toBe("Food");
      expect(res.body.expense.currency).toBe("INR");
    });
  });

  // ── Validation matrix ───────────────────────────────────────
  describe("validation", () => {
    const post = (body) => request(app).post(base()).set(auth(owner.token)).send(body);

    it("400 when title missing", async () => {
      const res = await post({ amount: 10, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(400);
    });

    it("400 when title is only whitespace", async () => {
      const res = await post({ title: "   ", amount: 10, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(400);
    });

    it("creates successfully without a description (optional) and defaults it to ''", async () => {
      const res = await post({ title: "No note", amount: 10, paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(201);
      expect(res.body.expense.title).toBe("No note");
      expect(res.body.expense.description).toBe("");
    });

    it("stores an optional description when provided", async () => {
      const res = await post({
        title: "Dinner",
        description: "Beachside shack, split with the group",
        amount: 10,
        paidBy: owner.user._id,
        participants: [{ user: owner.user._id }],
      });
      expect(res.status).toBe(201);
      expect(res.body.expense.description).toBe("Beachside shack, split with the group");
    });

    it("400 when amount missing", async () => {
      const res = await post({ title: "x", paidBy: owner.user._id, participants: [{ user: owner.user._id }] });
      expect(res.status).toBe(400);
    });

    it("400 when participants empty", async () => {
      const res = await post({ title: "x", amount: 10, paidBy: owner.user._id, participants: [] });
      expect(res.status).toBe(400);
    });

    it("400 on duplicate participants", async () => {
      const res = await post({
        title: "dup",
        amount: 10,
        paidBy: owner.user._id,
        participants: [{ user: owner.user._id }, { user: owner.user._id }],
      });
      expect(res.status).toBe(400);
    });
  });

  // ── Read-access control ─────────────────────────────────────
  describe("read access", () => {
    beforeEach(async () => {
      await request(app).post(base()).set(auth(owner.token)).send({
        title: "Shared",
        amount: 90,
        paidBy: owner.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
      });
    });

    it("viewers CAN read expenses, balances and breakdowns", async () => {
      const list = await request(app).get(base()).set(auth(viewer.token));
      expect(list.status).toBe(200);
      const bal = await request(app).get(`${base()}/balances`).set(auth(viewer.token));
      expect(bal.status).toBe(200);
      const bd = await request(app).get(`${base()}/user/${viewer.user._id}`).set(auth(viewer.token));
      expect(bd.status).toBe(200);
    });

    it("non-members are denied reads (403)", async () => {
      const stranger = await createAuthUser();
      expect((await request(app).get(base()).set(auth(stranger.token))).status).toBe(403);
      expect((await request(app).get(`${base()}/balances`).set(auth(stranger.token))).status).toBe(403);
    });

    it("unauthenticated reads are 401", async () => {
      expect((await request(app).get(base())).status).toBe(401);
      expect((await request(app).get(`${base()}/balances`)).status).toBe(401);
    });
  });

  // ── Balances across multiple payers ─────────────────────────
  describe("multi-payer balances", () => {
    it("nets correctly and settlements conserve money to zero", async () => {
      // owner pays 60, split 3 ways equally (20 each)
      await request(app).post(base()).set(auth(owner.token)).send({
        title: "Hotel",
        amount: 60,
        paidBy: owner.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
      });
      // editor pays 30, split between owner & editor (15 each)
      await request(app).post(base()).set(auth(editor.token)).send({
        title: "Cab",
        amount: 30,
        paidBy: editor.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }],
      });

      const res = await request(app).get(`${base()}/balances`).set(auth(owner.token));
      const byId = Object.fromEntries(res.body.balances.map((b) => [b.user._id, b]));
      expect(byId[owner.user._id.toString()].net).toBeCloseTo(25, 5);  // paid 60, owes 35
      expect(byId[editor.user._id.toString()].net).toBeCloseTo(-5, 5); // paid 30, owes 35
      expect(byId[viewer.user._id.toString()].net).toBeCloseTo(-20, 5);

      const netSum = res.body.balances.reduce((a, b) => a + b.net, 0);
      expect(netSum).toBeCloseTo(0, 5);

      // Applying the suggested settlements must zero everyone out.
      const final = Object.fromEntries(res.body.balances.map((b) => [b.user._id, b.net]));
      for (const t of res.body.settlements) {
        final[t.from] += t.amount;
        final[t.to] -= t.amount;
      }
      for (const v of Object.values(final)) expect(v).toBeCloseTo(0, 5);
    });

    it("keeps a removed member's balance so money still reconciles (marked former)", async () => {
      // owner pays 90, split 3 ways equally (30 each).
      await request(app).post(base()).set(auth(owner.token)).send({
        title: "Villa",
        amount: 90,
        paidBy: owner.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }, { user: viewer.user._id }],
      });
      // The viewer leaves / is removed from the trip AFTER incurring a share.
      await request(app).delete(`/api/trips/${trip._id}/members/${viewer.user._id}`).set(auth(owner.token));

      const res = await request(app).get(`${base()}/balances`).set(auth(owner.token));
      const byId = Object.fromEntries(res.body.balances.map((b) => [b.user._id, b]));

      // The ex-member still appears (flagged former) with their 30 owed.
      const ex = byId[viewer.user._id.toString()];
      expect(ex).toBeTruthy();
      expect(ex.former).toBe(true);
      expect(ex.net).toBeCloseTo(-30, 5);
      // Current members are not flagged former.
      expect(byId[owner.user._id.toString()].former).toBe(false);

      // Money is conserved and settlements still zero everyone out.
      const netSum = res.body.balances.reduce((a, b) => a + b.net, 0);
      expect(netSum).toBeCloseTo(0, 5);
      const final = Object.fromEntries(res.body.balances.map((b) => [b.user._id, b.net]));
      for (const t of res.body.settlements) { final[t.from] += t.amount; final[t.to] -= t.amount; }
      for (const v of Object.values(final)) expect(v).toBeCloseTo(0, 5);
    });

    it("balances recompute after an expense is deleted", async () => {
      const create = await request(app).post(base()).set(auth(owner.token)).send({
        title: "Temp",
        amount: 50,
        paidBy: owner.user._id,
        splitMethod: "equal",
        participants: [{ user: owner.user._id }, { user: editor.user._id }],
      });
      await request(app).delete(`${base()}/${create.body.expense._id}`).set(auth(owner.token));
      const res = await request(app).get(`${base()}/balances`).set(auth(owner.token));
      expect(res.body.total).toBe(0);
      expect(res.body.balances.every((b) => b.net === 0)).toBe(true);
      expect(res.body.settlements).toHaveLength(0);
    });
  });

  // ── Breakdown pagination ────────────────────────────────────
  describe("breakdown pagination", () => {
    it("paginates a member's expenses with a cursor", async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).post(base()).set(auth(owner.token)).send({
          title: `E${i}`,
          amount: 20,
          paidBy: owner.user._id,
          splitMethod: "equal",
          participants: [{ user: owner.user._id }, { user: editor.user._id }],
        });
      }
      const p1 = await request(app)
        .get(`${base()}/user/${editor.user._id}?limit=2`)
        .set(auth(editor.token));
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.hasMore).toBe(true);

      const p2 = await request(app)
        .get(`${base()}/user/${editor.user._id}?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
        .set(auth(editor.token));
      expect(p2.body.items).toHaveLength(1);
      expect(p2.body.hasMore).toBe(false);
    });
  });
});
