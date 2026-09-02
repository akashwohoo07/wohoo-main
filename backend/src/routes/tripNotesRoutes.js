import express from "express";
import { protect } from "../middleware/auth.js";
import {
  listNotes, addNote, deleteNote,
  listChecklists, createChecklist, deleteChecklist,
  addItem, updateItem, deleteItem,
} from "../controllers/tripNotesController.js";

// mergeParams to read :tripId from the mount path (/api/trips/:tripId).
const router = express.Router({ mergeParams: true });

router.use(protect);

// Notes feed
router.get("/notes", listNotes);
router.post("/notes", addNote);
router.delete("/notes/:noteId", deleteNote);

// Checklists
router.get("/checklists", listChecklists);
router.post("/checklists", createChecklist);
router.delete("/checklists/:id", deleteChecklist);
router.post("/checklists/:id/items", addItem);
router.patch("/checklists/:id/items/:itemId", updateItem);
router.delete("/checklists/:id/items/:itemId", deleteItem);

export default router;
