import type { ReactNode } from "react";
import clsx from "clsx";
import { RailLeft } from "./RailLeft";
import { RailRight } from "./RailRight";

/* AppShell — shared 3-column app grid (left rail · main · optional right).
   Renders <RailLeft/>, then the page's own <main> (children), then the right
   column (default variant only; defaults to <RailRight/>). The page supplies
   its own <main>; AppShell does not wrap children.
   variant: "default" (3-col with right) | "no-right" (centered main) | "wide" (full-width main). */
export function AppShell({
  children,
  right,
  variant = "default",
}: {
  children: ReactNode;
  right?: ReactNode;
  variant?: "default" | "no-right" | "wide";
}) {
  const showRight = variant === "default";
  return (
    <div
      className={clsx(
        "shell",
        variant === "no-right" && "no-right",
        variant === "wide" && "wide"
      )}
    >
      <RailLeft />
      {children}
      {showRight && (right ?? <RailRight />)}
    </div>
  );
}

export default AppShell;
