import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/* Card — <section className="card"> wrapper; accepts standard section props. */
export function Card({
  children,
  className,
  ...rest
}: { children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx("card", className)} {...rest}>
      {children}
    </section>
  );
}

export default Card;
