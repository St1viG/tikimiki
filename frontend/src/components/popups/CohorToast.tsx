"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";

/**
 * CohorToast — the bottom-center notification used across the /cohor chat app.
 *
 * Bottom-center toast for vote / bounty / results-locked feedback. A controlled
 * component: the parent keeps the toast state and renders this with `show`
 * toggled. Variant classes `.cohor-toast-{violet|lemon|red}`, the `.show`
 * animation and colors come from cohor.css.
 */
export type CohorToastVariant = "violet" | "lemon" | "red";

export function CohorToast({
  variant,
  icon,
  show,
  children,
}: {
  variant: CohorToastVariant;
  icon: string;
  show: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "cohor-toast",
        `cohor-toast-${variant}`,
        show && "show"
      )}
      role="status"
      aria-live="polite"
    >
      <Icon name={icon} className="ic-sm" />
      <span>{children}</span>
    </div>
  );
}

export default CohorToast;
