"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { ASPECTS, ASPECT_ORDER, type AspectKey } from "@/lib/aspect";
import { coverMetrics, coverStyle } from "@/lib/coverCrop";

const RATIO_LABEL: Record<AspectKey, string> = {
  portrait: "4:5",
  square: "1:1",
  landscape: "16:9",
};

const MAX_ZOOM = 4;

/**
 * ImageCropper — a focused overlay for positioning one image inside a fixed
 * aspect ratio. The image is cover-fit in the frame; the zoom bar scales it in
 * and dragging pans it (within the overflow either axis allows) to choose the
 * focal point. The ratio buttons switch the frame (applies to the whole post).
 * The same ratio/focal/zoom values are baked into the upload on post.
 *
 * Pass `lockedRatio` to pin the frame to a single ratio and hide the picker —
 * used for avatar (1:1) and banner (3:1) where the target shape is fixed.
 * `lockedLabel` is the small caption shown in place of the ratio buttons.
 */
export function ImageCropper({
  src,
  imgRatio,
  ratioKey,
  onRatioKey,
  focalX,
  focalY,
  zoom,
  onChange,
  onClose,
  hint,
  done,
  onDone,
  lockedRatio,
  lockedLabel,
}: {
  src: string;
  imgRatio: number;
  ratioKey?: AspectKey;
  onRatioKey?: (key: AspectKey) => void;
  focalX: number;
  focalY: number;
  zoom: number;
  onChange: (focalX: number, focalY: number, zoom: number) => void;
  onClose: () => void;
  hint: string;
  done: string;
  /**
   * Action for the "done" button. When omitted it falls back to `onClose`
   * (the post composer stores values and bakes later). Provide it to make the
   * button a distinct commit while Escape / backdrop still cancel via onClose.
   */
  onDone?: () => void;
  /** When set, pins the frame to this width/height ratio and hides the picker. */
  lockedRatio?: number;
  /** Caption shown in place of the ratio buttons when `lockedRatio` is set. */
  lockedLabel?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Ref-mirror of props lets onPointerMove close over fresh values without being re-registered on every render.
  const latest = useRef({ x: focalX, y: focalY, z: zoom });
  latest.current = { x: focalX, y: focalY, z: zoom };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const ratio = lockedRatio ?? ASPECTS[ratioKey ?? "square"];

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const el = frameRef.current;
    if (!el) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const { overflowX, overflowY } = coverMetrics(imgRatio, ratio, latest.current.z);
    const ovX = overflowX * el.clientWidth;
    const ovY = overflowY * el.clientHeight;
    // Invert dx/dy: dragging right pans left (focal decreases); guard ovX===0 to avoid division by zero when no horizontal overflow.
    const nx = ovX > 0 ? clamp01(latest.current.x - dx / ovX) : latest.current.x;
    const ny = ovY > 0 ? clamp01(latest.current.y - dy / ovY) : latest.current.y;
    onChange(nx, ny, latest.current.z);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
  };

  return (
    <div
      className="crop-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="crop-panel">
        <div className="crop-stage">
          <div
            ref={frameRef}
            className="crop-frame"
            style={{ aspectRatio: String(ratio) }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="crop-img"
              src={src}
              alt=""
              draggable={false}
              style={coverStyle(imgRatio, ratio, focalX, focalY, zoom)}
            />
            <span className="crop-grid" aria-hidden="true" />
          </div>
        </div>

        <div className="crop-zoom">
          <Icon name="search" className="crop-zoom-ic crop-zoom-sm" />
          <input
            type="range"
            className="crop-range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            onChange={(e) => onChange(focalX, focalY, Number(e.target.value))}
          />
          <Icon name="search" className="crop-zoom-ic" />
        </div>

        <div className="crop-bar">
          {lockedRatio != null ? (
            <div className="crop-ratios">
              <span className="crop-ratio is-on" aria-hidden="true">
                <span className="crop-ratio-ico" style={{ aspectRatio: String(lockedRatio) }} />
                {lockedLabel}
              </span>
            </div>
          ) : (
            <div className="crop-ratios" role="group" aria-label="Aspect ratio">
              {ASPECT_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`crop-ratio${key === ratioKey ? " is-on" : ""}`}
                  onClick={() => onRatioKey?.(key)}
                >
                  <span
                    className="crop-ratio-ico"
                    style={{ aspectRatio: String(ASPECTS[key]) }}
                    aria-hidden="true"
                  />
                  {RATIO_LABEL[key]}
                </button>
              ))}
            </div>
          )}
          <span className="crop-hint">{hint}</span>
          <button type="button" className="btn btn-violet crop-done" onClick={onDone ?? onClose}>
            {done}
          </button>
        </div>
      </div>
    </div>
  );
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default ImageCropper;
