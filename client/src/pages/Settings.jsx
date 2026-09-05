import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AtSign, Mail, ChevronRight, User as UserIcon, Camera, Loader2, Trash2, Crop } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { uploadImage, ACCEPTED_IMAGE_TYPES } from "../lib/uploadImage";
import { getCroppedFile } from "../lib/cropImage";
import ImageCropModal from "../components/ImageCropModal";

// Cover crop shape (wide banner) vs avatar (square, round preview).
const COVER_ASPECT = 3 / 1;

// A settings row. Clickable rows get a chevron; static rows just show a value.
function Row({ icon: Icon, label, value, hint, onClick, action }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${onClick ? "hover:bg-zinc-50 transition-colors" : ""}`}
    >
      <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        {value ? <p className="text-xs text-zinc-400 truncate">{value}</p> : hint ? <p className="text-xs text-zinc-300 truncate">{hint}</p> : null}
      </div>
      {action ? <span className="text-xs font-medium text-rose-500 flex-shrink-0">{action}</span> : null}
      {onClick && <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />}
    </Wrapper>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const avatarInput = useRef(null);
  const coverInput = useRef(null);
  const [busy, setBusy] = useState(null); // "avatar" | "cover" | null
  const [error, setError] = useState("");
  // { kind, src, aspect, cropShape, originalFile } while the cropper is open.
  const [crop, setCrop] = useState(null);

  // Pick a NEW file → open the cropper on it (we keep the original file to store).
  const pickFile = (kind, file) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { setError("Please choose a JPEG, PNG or WebP image."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setCrop({
      kind, src: reader.result, originalFile: file,
      aspect: kind === "cover" ? COVER_ASPECT : 1,
      cropShape: kind === "cover" ? "rect" : "round",
    });
    reader.readAsDataURL(file);
  };

  // Re-adjust an existing photo → open the cropper on the stored ORIGINAL
  // (falls back to the current cropped image for pre-crop-feature photos).
  const adjust = (kind) => {
    const raw = user?.[`${kind}Original`] || user?.[kind];
    if (!raw) return;
    setError("");
    // Cache-bust so the cropper's cross-origin request is fresh (and gets the
    // CDN's CORS header) instead of reusing a non-CORS copy the browser cached
    // when the image was first shown via a plain <img>.
    const src = `${raw}${raw.includes("?") ? "&" : "?"}cors=${Date.now()}`;
    setCrop({ kind, src, originalFile: null, aspect: kind === "cover" ? COVER_ASPECT : 1, cropShape: kind === "cover" ? "rect" : "round" });
  };

  // Save from the cropper: upload the cropped image; if it's a brand-new file,
  // also store the uncropped original so it can be re-adjusted later.
  const onCropSave = async (areaPixels) => {
    const { kind, src, originalFile } = crop;
    const cropped = await getCroppedFile(src, areaPixels, { fileName: `${kind}.jpg`, mime: "image/jpeg" });
    const url = await uploadImage(cropped, kind);
    const patch = { [kind]: url };
    if (originalFile) {
      const origUrl = await uploadImage(originalFile, `${kind}Original`);
      patch[`${kind}Original`] = origUrl;
    }
    setUser((u) => ({ ...u, ...patch }));
    setCrop(null);
  };

  const removeImage = async (kind) => {
    setError(""); setBusy(kind);
    try {
      await api.delete(`/uploads/${kind}`);
      api.delete(`/uploads/${kind}Original`).catch(() => {}); // drop the stored original too
      setUser((u) => ({ ...u, [kind]: "", [`${kind}Original`]: "" }));
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove image");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-100">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/dashboard")} className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-semibold text-zinc-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile card — cover banner + avatar with upload controls */}
        <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden">
          {/* Cover */}
          <div className="relative h-28 sm:h-32 bg-gradient-to-br from-rose-100 via-zinc-100 to-blue-100">
            {user?.cover && <img src={user.cover} alt="" className="w-full h-full object-cover" />}
            <div className="absolute top-2 right-2 flex gap-1.5">
              {user?.cover && (
                <>
                  <button onClick={() => adjust("cover")} disabled={busy} title="Adjust cover"
                    className="w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/55 disabled:opacity-50">
                    <Crop className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeImage("cover")} disabled={busy} title="Remove cover"
                    className="w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/55 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button onClick={() => coverInput.current?.click()} disabled={busy} title="Change cover"
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/55 disabled:opacity-50">
                {busy === "cover" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Avatar + name */}
          <div className="px-4 pb-4 -mt-9 flex items-end gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-full ring-4 ring-white overflow-hidden bg-rose-100 flex items-center justify-center">
                {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-rose-600">{(user?.name || "?").charAt(0).toUpperCase()}</span>}
              </div>
              <button onClick={() => avatarInput.current?.click()} disabled={busy} title="Change photo"
                className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center ring-2 ring-white hover:bg-rose-600 disabled:opacity-50">
                {busy === "avatar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="min-w-0 pb-1 flex-1">
              <p className="text-base font-semibold text-zinc-900 truncate">{user?.name}</p>
              <p className="text-sm text-zinc-400 truncate">{user?.username ? `@${user.username}` : "No username yet"}</p>
            </div>
            {user?.avatar && (
              <button onClick={() => adjust("avatar")} disabled={busy} className="text-xs font-medium text-rose-500 hover:text-rose-600 inline-flex items-center gap-1 pb-1 flex-shrink-0">
                <Crop className="w-3.5 h-3.5" /> Adjust
              </button>
            )}
          </div>

          {error && <p className="text-sm text-rose-500 px-4 pb-3 -mt-1">{error}</p>}

          {/* Hidden file inputs */}
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={(e) => { pickFile("avatar", e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={(e) => { pickFile("cover", e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-2">Account</h2>
          <div className="bg-white border border-zinc-100 rounded-2xl divide-y divide-zinc-50 overflow-hidden">
            <Row
              icon={AtSign}
              label="Username"
              value={user?.username ? `@${user.username}` : undefined}
              hint={user?.username ? undefined : "Pick a username so others can find you"}
              onClick={() => navigate("/set-username")}
              action={user?.username ? "Change" : "Set"}
            />
            {user?.email && <Row icon={Mail} label="Email" value={user.email} />}
            {user?.username && <Row icon={UserIcon} label="View public profile" onClick={() => navigate(`/u/${user.username}`)} />}
          </div>
        </section>

        {/* Placeholder for future settings */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-2">Preferences</h2>
          <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-zinc-400">More settings coming soon.</p>
          </div>
        </section>
      </main>

      {crop && (
        <ImageCropModal
          src={crop.src}
          aspect={crop.aspect}
          cropShape={crop.cropShape}
          title={crop.kind === "cover" ? "Adjust cover photo" : "Adjust profile photo"}
          onCancel={() => setCrop(null)}
          onSave={onCropSave}
        />
      )}
    </div>
  );
}
