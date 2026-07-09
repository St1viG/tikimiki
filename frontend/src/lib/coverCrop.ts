import type { CSSProperties } from "react";

/**
 * Geometry for showing an image cover-fit inside a fixed-ratio frame with a
 * zoom factor and a focal point. Expressed as fractions of the frame so the
 * same numbers drive the on-screen preview (CSS %, no pixel measuring) and the
 * canvas bake (lib/cropImage). zoom = 1 is plain cover; >1 zooms in, which
 * creates pannable overflow on both axes.
 */
export function coverMetrics(imgRatio: number, frameRatio: number, zoom: number) {
  const ir = imgRatio > 0 ? imgRatio : 1;
  const r = frameRatio;
  // Image size at zoom 1, as a multiple of each frame dimension (one axis = 1).
  let baseW: number;
  let baseH: number;
  if (ir > r) {
    baseH = 1;
    baseW = ir / r;
  } else {
    baseW = 1;
    baseH = r / ir;
  }
  const dispW = baseW * zoom;
  const dispH = baseH * zoom;
  return { dispW, dispH, overflowX: dispW - 1, overflowY: dispH - 1 };
}

/** Inline style positioning an absolutely-placed <img> per coverMetrics. */
export function coverStyle(
  imgRatio: number,
  frameRatio: number,
  focalX: number,
  focalY: number,
  zoom: number,
): CSSProperties {
  const { dispW, dispH, overflowX, overflowY } = coverMetrics(imgRatio, frameRatio, zoom);
  return {
    position: "absolute",
    width: `${dispW * 100}%`,
    height: `${dispH * 100}%`,
    left: `${-overflowX * focalX * 100}%`,
    top: `${-overflowY * focalY * 100}%`,
    objectFit: "cover",
  };
}
