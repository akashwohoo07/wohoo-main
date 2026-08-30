import { useState, useRef } from "react";
import { NotebookPen, FolderOpen, Check } from "lucide-react";
import api from "../../api/axios";

export function NotesTab({ trip, canEdit, isMember }) {
  const [note, setNote] = useState(trip.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef(null);

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <NotebookPen className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Notes are private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view notes.</p>
      </div>
    );
  }

  const handleChange = (val) => {
    setNote(val);
    setSaved(false);
    if (!canEdit) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try { await api.put(`/trips/${trip._id}`, { notes: val }); setSaved(true); } catch {}
      finally { setSaving(false); }
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100 flex-shrink-0">
        <h3 className="text-sm font-semibold text-zinc-600">Trip Notes</h3>
        {canEdit && (
          <span className="text-xs text-zinc-400 inline-flex items-center gap-1">
            {saving ? "Saving..." : saved ? <><Check className="w-3 h-3" /> Saved</> : "Auto-saves"}
          </span>
        )}
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        {canEdit ? (
          <textarea
            value={note}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write trip notes, packing lists, important info..."
            className="w-full h-full resize-none outline-none text-sm text-zinc-700 placeholder-zinc-300 leading-relaxed min-h-64"
          />
        ) : (
          <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
            {note || <span className="text-zinc-300 italic">No notes added yet.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function FilesTab({ trip, canEdit, isMember }) {
  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <FolderOpen className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Files are private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view files.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <FolderOpen className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
      <h3 className="font-semibold text-zinc-700">Trip files</h3>
      <p className="text-sm text-zinc-400">
        {canEdit ? "Upload documents, tickets and bookings." : "No files added yet."}
      </p>
      {canEdit && (
        <button className="mt-2 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium px-5 py-2.5 rounded-full transition-all flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload files
        </button>
      )}
    </div>
  );
}