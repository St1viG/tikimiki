"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { ImageLightbox } from "@/components/ImageLightbox";
import { snapAspect } from "@/lib/aspect";
import type { PostMedia as Media } from "@tikimiki/types";

/**
 * PostMedia — renders a post's image/video attachments. A single item shows on
 * its own; multiple become a carousel (sliding track, hover-only arrows, dots
 * beneath).
 *
 * Media is constrained to three aspect ratios (4:5 / 1:1 / 16:9). The frame is
 * sized to the snapped ratio of the first item and stays FIXED for every slide
 * (object-fit:cover), so a carousel never morphs — the arrows keep their place —
 * and there are no letterbox bars. Images are baked to the post's ratio at
 * compose time, so cover doesn't crop them further; legacy/video items snap to
 * the nearest allowed ratio.
 *
 * With `lightbox`, clicking an image opens a full-screen preview of the whole
 * picture. (In the feed the image click instead bubbles up to open the post.)
 */
export function PostMedia({
  items,
  lightbox = false,
  maxHeight,
}: {
  items: Media[];
  lightbox?: boolean;
  /** Cap the frame's height (e.g. "60vh") while keeping its ratio — the frame
   *  narrows and centers instead of cropping. Used in the detail modal so a tall
   *  4:5 image fits the screen. */
  maxHeight?: string;
}) {
  const [idx, setIdx] = useState(0);
  // Measured natural ratio per slide (index → raw width/height).
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [lbUrl, setLbUrl] = useState<string | null>(null);

  // Preload images to learn the first item's ratio up front, so the frame is
  // sized before the first paint rather than snapping in afterwards.
  useEffect(() => {
    let cancelled = false;
    items.forEach((m, j) => {
      if (m.type !== "image") return;
      const img = new window.Image();
      img.onload = () => {
        if (cancelled) return;
        const r = img.naturalWidth / img.naturalHeight;
        if (r > 0) setRatios((prev) => (prev[j] === r ? prev : { ...prev, [j]: r }));
      };
      img.src = m.url;
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  if (!items.length) return null;

  const i = Math.min(idx, items.length - 1);
  const multi = items.length > 1;
  const go = (delta: number) =>
    setIdx((i + delta + items.length) % items.length);

  const setRatioAt = (j: number, raw: number) => {
    if (raw > 0) setRatios((prev) => (prev[j] === raw ? prev : { ...prev, [j]: raw }));
  };

  // ONE stable frame for the whole post: the snapped ratio of the first item
  // (or the lowest-index item measured so far). Fixed across slides → no morph,
  // arrows stay put, no letterbox.
  const keys = Object.keys(ratios)
    .map(Number)
    .sort((a, b) => a - b);
  const firstKnown = ratios[0] ?? (keys.length ? ratios[keys[0]] : undefined);
  const frameRatio = firstKnown ? snapAspect(firstKnown) : undefined;
  // Capping by width (= maxHeight × ratio) keeps the ratio while bounding the
  // height, so a tall image narrows and centers rather than getting cropped.
  const frameStyle: CSSProperties | undefined = frameRatio
    ? {
        aspectRatio: String(frameRatio),
        ...(maxHeight
          ? { maxWidth: `calc(${maxHeight} * ${frameRatio})`, marginInline: "auto" }
          : {}),
      }
    : undefined;

  return (
    <div className="pm-wrap">
      <div className="post-photo pm-media" style={frameStyle}>
        <div
          className="pm-track"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {items.map((m, j) => (
            <div className="pm-slide" key={j}>
              {m.type === "video" ? (
                <video
                  className="pm-media-el"
                  src={m.url}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) =>
                    setRatioAt(
                      j,
                      e.currentTarget.videoWidth / e.currentTarget.videoHeight,
                    )
                  }
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={`pm-media-el${lightbox ? " pm-zoom" : ""}`}
                  src={m.url}
                  alt=""
                  loading="lazy"
                  onLoad={(e) =>
                    setRatioAt(
                      j,
                      e.currentTarget.naturalWidth /
                        e.currentTarget.naturalHeight,
                    )
                  }
                  onClick={
                    lightbox
                      ? (e) => {
                          e.stopPropagation();
                          setLbUrl(m.url);
                        }
                      : undefined
                  }
                />
              )}
            </div>
          ))}
        </div>

        {multi && (
          <>
            <button
              type="button"
              className="pm-arrow pm-arrow-prev"
              aria-label="Previous"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
            >
              <Icon name="arrow-left" />
            </button>
            <button
              type="button"
              className="pm-arrow pm-arrow-next"
              aria-label="Next"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
            >
              <Icon name="arrow-left" />
            </button>
          </>
        )}
      </div>

      {multi && (
        <div className="pm-dots">
          {items.map((_, j) => (
            <button
              type="button"
              key={j}
              className={`pm-dot${j === i ? " on" : ""}`}
              aria-label={`Image ${j + 1} of ${items.length}`}
              aria-current={j === i || undefined}
              onClick={(e) => {
                e.stopPropagation();
                setIdx(j);
              }}
            />
          ))}
        </div>
      )}

      {lbUrl && <ImageLightbox url={lbUrl} onClose={() => setLbUrl(null)} />}
    </div>
  );
}

export default PostMedia;
