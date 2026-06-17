"use client";

import { useEffect } from "react";
import { Icon } from "@/components/Icon";

/**
 * ImageLightbox — a full-screen overlay that shows an image in full (not
 * cropped), so you can see the whole picture. Closes on backdrop click, the X,
 * or Escape; locks background scroll while open. Sits above all other overlays.
 */
export function ImageLightbox({
  url,
  alt = "",
  onClose,
}: {
  url: string;
  alt?: string;
  onClose: () => void;
}) {
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

  return (
    <div
      className="lb-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button className="lb-close" onClick={onClose} aria-label="Close">
        <Icon name="x" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lb-img" src={url} alt={alt} />
    </div>
  );
}

export default ImageLightbox;
