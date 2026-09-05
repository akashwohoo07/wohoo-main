import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Loader2, ZoomIn } from "lucide-react";

// Crop/reposition modal. Drag to move, slider (or pinch/scroll) to zoom.
// onSave receives the crop rectangle in source-image pixels.
export default function ImageCropModal({ src, aspect = 1, cropShape = "rect", title = "Adjust photo", onCancel, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onComplete = useCallback((_, px) => setAreaPixels(px), []);

  const save = async () => {
    if (!areaPixels) return;
    setSaving(true); setError("");
    try { await onSave(areaPixels); }
    catch (err) { setError(err.response?.data?.message || err.message || "Could not save"); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button onClick={onCancel} disabled={saving} className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>

        <div className="relative bg-zinc-900" style={{ height: 340 }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            restrictPosition
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center gap-3 mb-4">
            <ZoomIn className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-rose-500" aria-label="Zoom" />
          </div>
          {error && <p className="text-sm text-rose-500 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving} className="flex-1 border border-zinc-200 hover:border-zinc-300 text-zinc-600 text-sm font-medium py-2.5 rounded-full transition-all">Cancel</button>
            <button onClick={save} disabled={saving || !areaPixels} className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-full transition-all inline-flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
