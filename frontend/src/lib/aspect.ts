/**
 * Post media is constrained to three aspect ratios — portrait 4:5, square 1:1,
 * and landscape 16:9. Limiting the set keeps carousels consistent (one stable
 * frame, no per-slide morphing or letterbox bars) and makes an in-composer
 * cropper tractable: the user picks one of three frames and positions the image
 * inside it. Display always uses object-fit:cover against the snapped ratio.
 */

export type AspectKey = "portrait" | "square" | "landscape";

export const ASPECTS: Record<AspectKey, number> = {
  portrait: 4 / 5, // 0.8
  square: 1, // 1.0
  landscape: 16 / 9, // ~1.778
};

/** Display order for the ratio picker (tallest → widest). */
export const ASPECT_ORDER: AspectKey[] = ["portrait", "square", "landscape"];

/** The allowed ratio closest to an arbitrary width/height value. */
export function snapAspectKey(ratio: number): AspectKey {
  if (!Number.isFinite(ratio) || ratio <= 0) return "square";
  let best: AspectKey = "square";
  let bestDist = Infinity;
  for (const key of ASPECT_ORDER) {
    const d = Math.abs(ratio - ASPECTS[key]);
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  return best;
}

export function snapAspect(ratio: number): number {
  return ASPECTS[snapAspectKey(ratio)];
}
