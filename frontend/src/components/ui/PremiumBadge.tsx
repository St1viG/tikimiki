import { Icon } from "@/components/Icon";

/**
 * PremiumBadge — the small "crystal" marker shown next to a user's name when
 * they hold an active Premium subscription. It borrows the deliberate crystal
 * treatment used by the Premium upsell (animated cyan→white→pink hue + glow),
 * which is the one place the product allows a multi-hue accent. Render it inline
 * after the name; pass `size` to scale it for larger headings.
 */
export function PremiumBadge({
  title = "Premium",
  size = 13,
}: {
  title?: string;
  size?: number;
}) {
  return (
    <span
      className="premium-badge"
      role="img"
      aria-label={title}
      title={title}
      style={{ "--pb-size": `${size}px` } as React.CSSProperties}
    >
      <Icon name="gem" />
    </span>
  );
}

export default PremiumBadge;
