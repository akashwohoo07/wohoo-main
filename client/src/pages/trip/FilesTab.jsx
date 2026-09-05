import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen, FileText, Image as ImageIcon, Upload, Download, Eye, Trash2, Pencil,
  Lock, Users, X, Loader2, Plus,
} from "lucide-react";
import api from "../../api/axios";
import { uploadTripFile, ACCEPTED_FILE_TYPES } from "../../lib/uploadTripFile";

const fmtBytes = (n) => {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

// Modal to name the file + choose who can see it, then upload.
function UploadModal({ file, onCancel, onDone, tripId }) {
  const base = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
  const [name, setName] = useState(base || "Document");
  const [visibility, setVisibility] = useState("members");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    if (!name.trim()) { setError("Please name the file"); return; }
    setBusy(true); setError("");
    try {
      const saved = await uploadTripFile(tripId, file, { name: name.trim(), visibility }, setProgress);
      onDone(saved);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Upload failed");
      setBusy(false);
    }
  };

  const isPdf = file.type === "application/pdf";
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900">Upload {isPdf ? "PDF" : "image"}</h3>
          <button onClick={onCancel} disabled={busy} className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-2.5 mb-4 text-sm text-zinc-500">
          {isPdf ? <FileText className="w-5 h-5 text-rose-500" /> : <ImageIcon className="w-5 h-5 text-blue-500" />}
          <span className="truncate">{file.name}</span>
          <span className="text-zinc-300 ml-auto flex-shrink-0">{fmtBytes(file.size)}</span>
        </div>

        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus disabled={busy}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-rose-400 mb-4" />

        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Who can see it</label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { id: "members", Icon: Users, label: "All members", desc: "Everyone on the trip" },
            { id: "private", Icon: Lock, label: "Only me", desc: "Just the uploader" },
          ].map((o) => (
            <button key={o.id} type="button" disabled={busy} onClick={() => setVisibility(o.id)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-all ${visibility === o.id ? "bg-rose-50 border-rose-300 text-rose-600" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
              <div className="flex items-center gap-1.5 text-sm font-medium"><o.Icon className="w-4 h-4" /> {o.label}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{o.desc}</div>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-rose-500 mb-3">{error}</p>}
        {busy && progress > 0 && (
          <div className="h-1.5 bg-zinc-100 rounded-full mb-3 overflow-hidden"><div className="h-full bg-rose-500 transition-all" style={{ width: `${progress}%` }} /></div>
        )}

        <button onClick={go} disabled={busy || !name.trim()}
          className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium py-3 rounded-full transition-all text-sm inline-flex items-center justify-center gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
        </button>
      </div>
    </div>
  );
}

export default function FilesTab({ trip, isMember }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null); // File chosen, awaiting name/visibility
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/trips/${trip._id}/files`); setData(data); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [trip._id]);

  useEffect(() => { if (isMember) load(); }, [isMember, load]);

  // The file streams through our API (auth + membership checked every request),
  // so the URL only works for the logged-in viewer — a forwarded link is useless
  // to a non-member. Opening it as a top-level navigation sends the auth cookie.
  const openLink = (file, download) => {
    const url = `${import.meta.env.VITE_API_URL}/api/trips/${trip._id}/files/${file._id}/download${download ? "" : "?inline=1"}`;
    window.open(url, "_blank", "noopener");
  };

  const removeFile = async (file) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    setBusyId(file._id);
    try { await api.delete(`/trips/${trip._id}/files/${file._id}`); setData((d) => ({ ...d, files: d.files.filter((f) => f._id !== file._id) })); load(); }
    catch (err) { setError(err.response?.data?.message || "Could not delete"); }
    finally { setBusyId(null); }
  };

  const toggleVisibility = async (file) => {
    setBusyId(file._id);
    const next = file.visibility === "members" ? "private" : "members";
    try {
      const { data } = await api.patch(`/trips/${trip._id}/files/${file._id}`, { visibility: next });
      setData((d) => ({ ...d, files: d.files.map((f) => (f._id === file._id ? data.file : f)) }));
    } catch (err) { setError(err.response?.data?.message || "Could not update"); }
    finally { setBusyId(null); }
  };

  const toggleEditorsUpload = async () => {
    try {
      const { data: r } = await api.patch(`/trips/${trip._id}/files/settings`, { editorsCanUpload: !data.editorsCanUpload });
      setData((d) => ({ ...d, editorsCanUpload: r.editorsCanUpload }));
    } catch (err) { setError(err.response?.data?.message || "Could not update setting"); }
  };

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <FolderOpen className="w-12 h-12 text-zinc-300" strokeWidth={1.5} />
        <h3 className="font-semibold text-zinc-700">Files are private</h3>
        <p className="text-sm text-zinc-400">Only trip members can view files.</p>
      </div>
    );
  }

  const canUpload = data?.canUpload;
  const counts = data?.counts || { pdf: 0, image: 0 };
  const limits = data?.limits || { pdf: 10, image: 10 };
  const atLimit = counts.pdf >= limits.pdf && counts.image >= limits.image;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-5">
      <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES.join(",")} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPending(f); e.target.value = ""; }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Trip files</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Tickets, bookings, IDs & documents — stored securely.</p>
        </div>
        {canUpload && (
          <button onClick={() => inputRef.current?.click()} disabled={atLimit}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-full transition-all flex-shrink-0">
            <Plus className="w-4 h-4" /> Upload
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-400 mb-4">
        PDFs {counts.pdf}/{limits.pdf} (≤5 MB) · Images {counts.image}/{limits.image} (≤10 MB)
        {atLimit && <span className="text-rose-400"> · limit reached</span>}
      </p>

      {/* Owner setting */}
      {data?.isOwner && (
        <label className="flex items-center gap-2.5 bg-zinc-50 border border-zinc-100 rounded-xl px-3.5 py-2.5 mb-5 cursor-pointer">
          <input type="checkbox" checked={!!data.editorsCanUpload} onChange={toggleEditorsUpload} className="accent-rose-500 w-4 h-4" />
          <span className="text-sm text-zinc-600">Let <b className="font-medium">editors</b> upload files too <span className="text-zinc-400">(off = only you)</span></span>
        </label>
      )}

      {error && <p className="text-sm text-rose-500 mb-3">{error}</p>}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-zinc-100 animate-pulse" />)}</div>
      ) : (data?.files?.length || 0) === 0 ? (
        <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 text-center">
          <FolderOpen className="w-10 h-10 text-zinc-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-zinc-500">{canUpload ? "No files yet — upload tickets, bookings or IDs." : "No files shared with you yet."}</p>
          {canUpload && <button onClick={() => inputRef.current?.click()} className="mt-4 text-sm font-medium text-rose-500 hover:text-rose-600">Upload a file</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {data.files.map((f) => {
            const isPdf = f.category === "pdf";
            const busy = busyId === f._id;
            return (
              <div key={f._id} className="group flex items-center gap-3 bg-white border border-zinc-100 rounded-xl px-3.5 py-3 hover:border-zinc-200 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPdf ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-500"}`}>
                  {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800 truncate">{f.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-0.5 ${f.visibility === "private" ? "text-amber-600" : ""}`}>
                      {f.visibility === "private" ? <><Lock className="w-3 h-3" /> Only {f.mine ? "you" : "them"}</> : <><Users className="w-3 h-3" /> Members</>}
                    </span>
                    · {fmtBytes(f.size)} · {f.mine ? "you" : `@${f.uploadedBy?.username || f.uploadedBy?.name}`} · {fmtDate(f.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin text-zinc-300 mr-1" /> : (
                    <>
                      <button onClick={() => openLink(f, false)} title="View" className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openLink(f, true)} title="Download" className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"><Download className="w-4 h-4" /></button>
                      {f.mine && (
                        <button onClick={() => toggleVisibility(f)} title={f.visibility === "members" ? "Make private" : "Share with members"} className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50">
                          {f.visibility === "members" ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        </button>
                      )}
                      {(f.mine || data?.isOwner) && (
                        <button onClick={() => removeFile(f)} title="Delete" className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <UploadModal
          file={pending}
          tripId={trip._id}
          onCancel={() => setPending(null)}
          onDone={() => { setPending(null); load(); }}
        />
      )}
    </div>
  );
}
