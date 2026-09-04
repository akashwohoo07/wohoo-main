import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";

vi.mock("../utils/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendUsernameConfirmEmail: vi.fn().mockResolvedValue(undefined),
}));

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `tn${Date.now()}${n++}`;
const dest = { name: "Goa", fullLabel: "Goa, India" };

async function makeTrip(roles = []) {
  const owner = await createAuthUser({ username: uname() });
  const members = [];
  for (const role of roles) { const m = await createAuthUser({ username: uname() }); members.push({ ...m, role }); }
  const trip = await Trip.create({
    name: "Trip", destination: dest, owner: owner.user._id,
    members: [{ user: owner.user._id, role: "owner" }, ...members.map((m) => ({ user: m.user._id, role: m.role }))],
  });
  return { owner, members, trip };
}

describe("Trip notes & checklists", () => {
  let owner, editor, viewer, trip;
  beforeEach(async () => {
    const s = await makeTrip(["editor", "viewer"]);
    owner = s.owner; editor = s.members[0]; viewer = s.members[1]; trip = s.trip;
  });
  const notes = () => `/api/trips/${trip._id}/notes`;
  const lists = () => `/api/trips/${trip._id}/checklists`;

  describe("notes feed", () => {
    it("any member (incl. viewer) can add a note, attributed to them", async () => {
      const res = await request(app).post(notes()).set(auth(viewer.token)).send({ text: "Bring sunscreen" });
      expect(res.status).toBe(201);
      expect(res.body.note.text).toBe("Bring sunscreen");
      expect(res.body.note.author.username).toBe(viewer.user.username);
    });

    it("400 on empty note, 403 for non-members, 401 unauth", async () => {
      expect((await request(app).post(notes()).set(auth(owner.token)).send({ text: "  " })).status).toBe(400);
      const stranger = await createAuthUser({ username: uname() });
      expect((await request(app).post(notes()).set(auth(stranger.token)).send({ text: "hi" })).status).toBe(403);
      expect((await request(app).get(notes())).status).toBe(401);
    });

    it("lists notes newest-first with pagination", async () => {
      for (let i = 0; i < 3; i++) await request(app).post(notes()).set(auth(owner.token)).send({ text: `n${i}` });
      const res = await request(app).get(`${notes()}?limit=2`).set(auth(editor.token));
      expect(res.body.notes).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
    });

    it("author or owner can delete a note; others can't (403)", async () => {
      const mine = await request(app).post(notes()).set(auth(editor.token)).send({ text: "mine" });
      // another member cannot delete it
      expect((await request(app).delete(`${notes()}/${mine.body.note._id}`).set(auth(viewer.token))).status).toBe(403);
      // author can
      expect((await request(app).delete(`${notes()}/${mine.body.note._id}`).set(auth(editor.token))).status).toBe(200);
      // owner can delete anyone's
      const other = await request(app).post(notes()).set(auth(editor.token)).send({ text: "x" });
      expect((await request(app).delete(`${notes()}/${other.body.note._id}`).set(auth(owner.token))).status).toBe(200);
    });
  });

  describe("checklists", () => {
    const create = (token, body) => request(app).post(lists()).set(auth(token)).send(body);

    it("creates a checklist with starter items", async () => {
      const res = await create(owner.token, { title: "Packing", items: ["Passport", "Charger", "Meds"] });
      expect(res.status).toBe(201);
      expect(res.body.checklist.title).toBe("Packing");
      expect(res.body.checklist.items).toHaveLength(3);
      expect(res.body.checklist.items[0].done).toBe(false);
      expect(res.body.checklist.createdBy.username).toBe(owner.user.username);
    });

    it("lists all checklists for the trip", async () => {
      await create(owner.token, { title: "A" });
      await create(editor.token, { title: "B" });
      const res = await request(app).get(lists()).set(auth(viewer.token));
      expect(res.body.checklists.map((c) => c.title)).toEqual(["A", "B"]);
    });

    it("adds, toggles (with doneBy), edits, and deletes items", async () => {
      const c = (await create(owner.token, { title: "Todo", items: ["one"] })).body.checklist;
      const itemId = c.items[0]._id;

      // toggle done
      let res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(editor.token)).send({ done: true });
      expect(res.status).toBe(200);
      const toggled = res.body.checklist.items.find((i) => i._id === itemId);
      expect(toggled.done).toBe(true);
      expect(String(toggled.doneBy)).toBe(String(editor.user._id));

      // unmark
      res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(editor.token)).send({ done: false });
      expect(res.body.checklist.items.find((i) => i._id === itemId).done).toBe(false);

      // add item
      res = await request(app).post(`${lists()}/${c._id}/items`).set(auth(viewer.token)).send({ text: "two" });
      expect(res.body.checklist.items).toHaveLength(2);

      // edit item text
      res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(owner.token)).send({ text: "one-updated" });
      expect(res.body.checklist.items.find((i) => i._id === itemId).text).toBe("one-updated");

      // delete item
      res = await request(app).delete(`${lists()}/${c._id}/items/${itemId}`).set(auth(owner.token));
      expect(res.body.checklist.items).toHaveLength(1);
    });

    it("400 on empty item, 404 for a missing checklist", async () => {
      const c = (await create(owner.token, {})).body.checklist;
      expect((await request(app).post(`${lists()}/${c._id}/items`).set(auth(owner.token)).send({ text: "" })).status).toBe(400);
      expect((await request(app).post(`${lists()}/507f1f77bcf86cd799439011/items`).set(auth(owner.token)).send({ text: "x" })).status).toBe(404);
    });

    it("creator or owner can delete a checklist; another member cannot (403)", async () => {
      const c = (await create(editor.token, { title: "E" })).body.checklist;
      expect((await request(app).delete(`${lists()}/${c._id}`).set(auth(viewer.token))).status).toBe(403);
      expect((await request(app).delete(`${lists()}/${c._id}`).set(auth(editor.token))).status).toBe(200);
    });

    it("blocks non-members (403)", async () => {
      const stranger = await createAuthUser({ username: uname() });
      expect((await request(app).get(lists()).set(auth(stranger.token))).status).toBe(403);
    });

    it("individual-scope: each member ticks their own item without affecting others", async () => {
      const c = (await create(owner.token, { title: "Packing", items: ["Raincoat"], scope: "individual" })).body.checklist;
      expect(c.scope).toBe("individual");
      const itemId = c.items[0]._id;

      // editor checks it for themselves
      let res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(editor.token)).send({ done: true });
      expect(res.status).toBe(200);
      let item = res.body.checklist.items.find((i) => i._id === itemId);
      expect(item.checkedBy.map(String)).toContain(String(editor.user._id));
      expect(item.checkedBy.map(String)).not.toContain(String(viewer.user._id));
      // shared flag is untouched for individual lists
      expect(item.done).toBe(false);

      // viewer checks it too — both are now present
      res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(viewer.token)).send({ done: true });
      item = res.body.checklist.items.find((i) => i._id === itemId);
      expect(item.checkedBy.map(String)).toEqual(
        expect.arrayContaining([String(editor.user._id), String(viewer.user._id)])
      );

      // editor unchecks — viewer's tick remains
      res = await request(app).patch(`${lists()}/${c._id}/items/${itemId}`).set(auth(editor.token)).send({ done: false });
      item = res.body.checklist.items.find((i) => i._id === itemId);
      expect(item.checkedBy.map(String)).toEqual([String(viewer.user._id)]);
    });
  });
});
