import clsx from "clsx";

/* Icon — renders a monoline icon (#i-<name>) from the shared sprite. Adds the
   base `ic` class and aria-hidden; extra classes go in `className`. Requires
   <Sprite/> on the page. */
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={clsx("ic", className)} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export default Icon;
