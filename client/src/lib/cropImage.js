// Produce a cropped File from a source image + the crop rectangle (pixels) that
// react-easy-crop reports. Runs on a canvas in the browser (no server involved).
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed so a remote original doesn't taint the canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export async function getCroppedFile(src, cropPixels, { fileName = "crop.jpg", mime = "image/jpeg" } = {}) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropPixels.width));
  canvas.height = Math.max(1, Math.round(cropPixels.height));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, canvas.width, canvas.height
  );
  const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.92));
  if (!blob) throw new Error("Could not process image");
  return new File([blob], fileName, { type: mime });
}
