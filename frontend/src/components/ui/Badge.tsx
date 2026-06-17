import clsx from "clsx";
import type { ReactNode } from "react";
import type { BadgeVariant } from "@/lib/types";

/* Badge — .badge + .badge-<variant> pill. Dotted variants (live/upcoming/ended/closed)
   get a leading dot automatically; pass `dot` to override. */
const DOTTED: Record<BadgeVariant, boolean> = {
  live: true,
  upcoming: true,
  open: false,
  ended: true,
  closed: true,
  warn: false,
};

export function Badge({
  variant,
  children,
  className,
  dot,
}: {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const showDot = dot ?? DOTTED[variant];
  return (
    <span className={clsx("badge", `badge-${variant}`, className)}>
      {showDot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export default Badge;
