"use client";

import { Icon } from "@/components/Icon";

/**
 * PurchaseToast — the slide-up toast notification for /store.
 *
 * Behaviour:
 *  - "ok" kind: green border + check icon that flashes in via @keyframes check-flash
 *  - "warn" kind: lemon border + bell icon
 *  - Shown by adding .show; hidden automatically by the parent after 3200ms.
 *
 * The CSS keyframe `check-flash` is defined in store.css, so no inline styles are
 * needed here.
 */

export type ToastKind = "ok" | "warn" | "hidden";

type Props = {
  message: string;
  kind: ToastKind;
};

export function PurchaseToast({ message, kind }: Props) {
  const visible = kind !== "hidden";
  const iconName = kind === "ok" ? "check" : "bell";

  let className = "toast";
  if (kind === "ok") className += " toast-ok";
  if (kind === "warn") className += " toast-warn";
  if (visible) className += " show";

  return (
    <div className={className} id="toast" role="status" aria-live="polite">
      {visible && (
        <>
          <Icon name={iconName} />
          <span>{message}</span>
        </>
      )}
    </div>
  );
}

export default PurchaseToast;
