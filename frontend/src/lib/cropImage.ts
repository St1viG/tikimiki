/**
 * Crop an image File to a target aspect ratio at a given focal point, returning
 * a JPEG Blob. The crop mirrors how the post will display (object-fit:cover at
 * the same ratio + object-position focal), so what the user positions in the
 * composer cropper is exactly what gets baked into the uploaded file. Because
 * the ratio is baked in, the feed needs no per-post crop metadata.
 *
 * focalX / focalY are 0..1 (the object-position fractions): the share of the
 * cropped-away overflow that sits before the visible window on each axis. zoom
 * (>= 1) shrinks the cropped region (zooms in), matching the cropper preview.
 */
export async function cropImageToRatio(
  file: File,
  ratio: number,
  focalX: number,
  focalY: number,
  zoom = 1,
  maxWidth = 1440,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const sourceRatio = sw / sh;
    const z = Math.max(1, zoom);

    // Cover crop at zoom 1, then shrink by the zoom factor (keeps the ratio).
    let cropW: number;
    let cropH: number;
    if (sourceRatio > ratio) {
      cropH = sh / z;
      cropW = (sh * ratio) / z;
    } else {
      cropW = sw / z;
      cropH = sw / ratio / z;
    }
    cropW = Math.round(cropW);
    cropH = Math.round(cropH);
    // (sw - cropW) is the total horizontal overflow; focalX says what share sits before the crop window.
    const sx = Math.round((sw - cropW) * clamp01(focalX));
    const sy = Math.round((sh - cropH) * clamp01(focalY));

    const outW = Math.min(cropW, maxWidth);
    const outH = Math.round(outW / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.9, // quality 0.9 keeps file size reasonable while avoiding visible JPEG artefacts
      ),
    );
  } finally {
    // Revoke in finally so the object URL is freed even if the canvas or toBlob throws.
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
