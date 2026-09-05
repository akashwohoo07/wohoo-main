import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "stream";
import request from "supertest";
import app from "../app.js";
import { createAuthUser } from "./helpers.js";
import Trip from "../models/Trip.js";
import TripFile from "../models/TripFile.js";

vi.mock("../config/r2.js", () => {
  const send = vi.fn();
  return { filesConfigured: true, R2_FILES_BUCKET_NAME: "wohoo-files", getR2: () => ({ send }) };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example.com/x"),
}));

import { getR2 } from "../config/r2.js";
const send = getR2().send;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;
const uname = () => `tf${Date.now()}${n++}`;

async function makeTrip({ editorsCanUpload = false } = {}) {
  const owner = await createAuthUser({ username: uname() });
  const editor = await createAuthUser({ username: uname() });
  const viewer = await createAuthUser({ username: uname() });
  const trip = await Trip.create({
    name: "Trip", destination: { name: "Goa" }, owner: owner.user._id,
    filesEditorsCanUpload: editorsCanUpload,
    members: [
      { user: owner.user._id, role: "owner" },
      { user: editor.user._id, role: "editor" },
      { user: viewer.user._id, role: "viewer" },
    ],
  });
  return { owner, editor, viewer, trip };
}

describe("Trip files (private documents)", () => {
  let owner, editor, viewer, trip;
  beforeEach(async () => {
    ({ owner, editor, viewer, trip } = await makeTrip());
    send.mockReset();
  });
  const base = () => `/api/trips/${trip._id}/files`;

  describe("upload permission (presign)", () => {
    const presign = (t, body = { contentType: "application/pdf" }) =>
      request(app).post(`${base()}/presign`).set(auth(t)).send(body);

    it("401 unauth", async () => {
      expect((await request(app).post(`${base()}/presign`).send({ contentType: "application/pdf" })).status).toBe(401);
    });
    it("owner can presign; viewer cannot (403)", async () => {
      expect((await presign(owner.token)).status).toBe(200);
      expect((await presign(viewer.token)).status).toBe(403);
    });
    it("editor blocked by default, allowed once owner enables the toggle", async () => {
      expect((await presign(editor.token)).status).toBe(403);
      await Trip.findByIdAndUpdate(trip._id, { filesEditorsCanUpload: true });
      expect((await presign(editor.token)).status).toBe(200);
    });
    it("400 on a disallowed content type", async () => {
      expect((await presign(owner.token, { contentType: "application/zip" })).status).toBe(400);
    });
    it("enforces the 10-PDF per-trip limit", async () => {
      for (let i = 0; i < 10; i++) {
        await TripFile.create({ trip: trip._id, uploadedBy: owner.user._id, name: `d${i}`, key: `trips/${trip._id}/${i}.pdf`, contentType: "application/pdf", size: 100, category: "pdf", visibility: "members" });
      }
      expect((await presign(owner.token)).status).toBe(400); // 11th pdf blocked
      expect((await presign(owner.token, { contentType: "image/png" })).status).toBe(200); // images independent
    });
  });

  describe("confirm", () => {
    const key = () => `trips/${trip._id}/abc.pdf`;
    const confirm = (t, body) => request(app).post(`${base()}/confirm`).set(auth(t)).send({ key: key(), name: "Ticket", contentType: "application/pdf", ...body });

    it("saves the file after validating size/type", async () => {
      send.mockResolvedValueOnce({ ContentType: "application/pdf", ContentLength: 1234 }); // HEAD
      const res = await confirm(owner.token, {});
      expect(res.status).toBe(201);
      expect(res.body.file).toMatchObject({ name: "Ticket", category: "pdf", visibility: "members", mine: true });
    });
    it("rejects + deletes an oversized pdf (>5MB)", async () => {
      send.mockResolvedValueOnce({ ContentType: "application/pdf", ContentLength: 6 * 1024 * 1024 }); // HEAD
      send.mockResolvedValueOnce({}); // delete
      expect((await confirm(owner.token, {})).status).toBe(400);
      expect(await TripFile.countDocuments({ trip: trip._id })).toBe(0);
    });
    it("400 when name is missing (and cleans up)", async () => {
      send.mockResolvedValueOnce({}); // delete
      expect((await confirm(owner.token, { name: "  " })).status).toBe(400);
    });
    it("400 when key isn't under this trip's prefix", async () => {
      const res = await request(app).post(`${base()}/confirm`).set(auth(owner.token)).send({ key: "trips/other/x.pdf", name: "x", contentType: "application/pdf" });
      expect(res.status).toBe(400);
    });
  });

  describe("visibility + access", () => {
    async function addFile(uploader, visibility) {
      return TripFile.create({ trip: trip._id, uploadedBy: uploader.user._id, name: "doc", key: `trips/${trip._id}/${uploader.user._id}-${visibility}.pdf`, contentType: "application/pdf", size: 100, category: "pdf", visibility });
    }

    it("members see 'members' files; a 'private' file is visible only to its uploader (even owner can't)", async () => {
      await addFile(owner, "members");
      await addFile(editor, "private");
      const ownerList = (await request(app).get(base()).set(auth(owner.token))).body.files;
      const editorList = (await request(app).get(base()).set(auth(editor.token))).body.files;
      expect(ownerList).toHaveLength(1); // only the members file (not editor's private)
      expect(editorList).toHaveLength(2); // members file + own private
    });

    it("stream: owner denied on someone else's private file (403); uploader can stream it", async () => {
      const f = await addFile(editor, "private");
      expect((await request(app).get(`${base()}/${f._id}/download`).set(auth(owner.token))).status).toBe(403);
      send.mockResolvedValueOnce({ Body: Readable.from(Buffer.from("%PDF data")), ContentType: "application/pdf", ContentLength: 9 });
      const ok = await request(app).get(`${base()}/${f._id}/download`).set(auth(editor.token));
      expect(ok.status).toBe(200);
      expect(ok.headers["content-type"]).toContain("application/pdf");
    });

    it("a NON-MEMBER cannot stream any file, even a members-visible one (403) — a forwarded link is useless", async () => {
      const f = await addFile(owner, "members");
      const stranger = await createAuthUser({ username: uname() });
      expect((await request(app).get(`${base()}/${f._id}/download`).set(auth(stranger.token))).status).toBe(403);
      // and unauthenticated → 401
      expect((await request(app).get(`${base()}/${f._id}/download`)).status).toBe(401);
    });

    it("viewer (member) can see + stream members files", async () => {
      const f = await addFile(owner, "members");
      expect((await request(app).get(base()).set(auth(viewer.token))).body.files).toHaveLength(1);
      send.mockResolvedValueOnce({ Body: Readable.from(Buffer.from("x")), ContentType: "application/pdf", ContentLength: 1 });
      expect((await request(app).get(`${base()}/${f._id}/download`).set(auth(viewer.token))).status).toBe(200);
    });
  });

  describe("edit / delete / settings", () => {
    async function addFile(uploader) {
      return TripFile.create({ trip: trip._id, uploadedBy: uploader.user._id, name: "doc", key: `trips/${trip._id}/${uploader.user._id}.pdf`, contentType: "application/pdf", size: 100, category: "pdf", visibility: "members" });
    }

    it("only the uploader can rename / change visibility", async () => {
      const f = await addFile(editor);
      expect((await request(app).patch(`${base()}/${f._id}`).set(auth(owner.token)).send({ name: "x" })).status).toBe(403);
      const ok = await request(app).patch(`${base()}/${f._id}`).set(auth(editor.token)).send({ visibility: "private", name: "My ID" });
      expect(ok.status).toBe(200);
      expect(ok.body.file.visibility).toBe("private");
    });

    it("uploader or trip owner can delete; others can't", async () => {
      const f1 = await addFile(editor);
      send.mockResolvedValue({}); // delete
      expect((await request(app).delete(`${base()}/${f1._id}`).set(auth(viewer.token))).status).toBe(403);
      expect((await request(app).delete(`${base()}/${f1._id}`).set(auth(owner.token))).status).toBe(200); // owner deletes editor's file
    });

    it("only the owner can toggle editors-can-upload", async () => {
      expect((await request(app).patch(`${base()}/settings`).set(auth(editor.token)).send({ editorsCanUpload: true })).status).toBe(403);
      const ok = await request(app).patch(`${base()}/settings`).set(auth(owner.token)).send({ editorsCanUpload: true });
      expect(ok.status).toBe(200);
      expect(ok.body.editorsCanUpload).toBe(true);
    });
  });
});
