import clsx from "clsx";
import type { ReactNode } from "react";
import type { AvatarKind } from "@/lib/types";

/* Avatar — .avatar.<kind> initials chip. kind ∈ brand|v|t|org maps to color treatments. */
export function Avatar({
  kind,
  children,
  className,
}: {
  kind: AvatarKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx("avatar", kind, className)} aria-hidden="true">
      {children}
    </span>
  );
}

export default Avatar;
