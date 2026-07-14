/**
 * Pure, unit-testable mappers for the /store catalogue.
 *
 * These were previously embedded inside StoreClient.tsx. Extracting them keeps
 * the React component focused on state/rendering and lets the classification /
 * shaping logic be tested in isolation.
 */
import { formatXp } from "@/lib/format";
import type { Cosmetic, Merch } from "@/lib/api";

export type FilterCat = "sve" | "majice" | "duks" | "solje" | "premium";

export type MerchBadge = {
  label: string;
  kind: "hot" | "new" | "premium" | "best";
};

export type MerchItem = {
  id: string;
  cat: FilterCat;
  name: string;
  variant: string;
  price: number;
  icon: string;
  /** Real product photo, when the catalogue provides one; falls back to `icon`. */
  imageUrl: string | null;
  hasSizes: boolean;
  isPremium?: boolean;
  badge?: MerchBadge;
  ariaLabel: string;
  /**
   * Whether buying this item collects a shipping address. Digital cosmetics are
   * fulfilled instantly (false); physical merch is shipped (true).
   */
  requiresDelivery: boolean;
  /** Backing API record so purchase confirm can call the right endpoint. */
  source: "cosmetic" | "merch";
  cosmeticId?: string;
  merchId?: string;
  variants?: { variantId: string; label: string; stock: number }[];
};

/** Badge label/kind for a cosmetic based on its rarity. */
export function cosmeticBadge(rarity: string): MerchBadge {
  const r = rarity.toLowerCase();
  if (r === "legendary" || r === "mythic") return { label: rarity, kind: "best" };
  if (r === "epic" || r === "rare") return { label: rarity, kind: "premium" };
  return { label: "Premium", kind: "premium" };
}

/** Map a cosmetic (digital / premium-ish item) into the store-grid shape. */
export function cosmeticToItem(c: Cosmetic): MerchItem {
  const price = c.pointCost ?? 0;
  return {
    id: `cosmetic-${c.cosmeticId}`,
    cat: "premium",
    name: c.name,
    variant: c.description ?? c.type,
    price,
    icon: "premium",
    imageUrl: null,
    hasSizes: false,
    isPremium: true,
    badge: cosmeticBadge(c.rarity),
    ariaLabel: `${c.name}, ${formatXp(price)} XP`,
    requiresDelivery: false,
    source: "cosmetic",
    cosmeticId: c.cosmeticId,
  };
}

/** Classify a physical merch item into a filter category from its name. */
export function merchCategory(name: string): FilterCat {
  const n = name.toLowerCase();
  if (n.includes("duks") || n.includes("hoodie") || n.includes("duksev")) return "duks";
  if (
    n.includes("šolj") ||
    n.includes("solj") ||
    n.includes("mug") ||
    n.includes("termos") ||
    n.includes("boca") ||
    n.includes("bottle") ||
    n.includes("cup")
  )
    return "solje";
  if (n.includes("majic") || n.includes("shirt") || n.includes("tee") || n.includes("t-shirt"))
    return "majice";
  return "majice";
}

/** Icon for a physical merch item based on its category. */
export function merchIcon(cat: FilterCat): string {
  if (cat === "duks") return "shield";
  if (cat === "solje") return "coin";
  return "image";
}

/** Map a physical merch product into the store-grid shape. */
export function merchToItem(m: Merch): MerchItem {
  const cat = merchCategory(m.name);
  const hasSizes = m.variants.length > 0;
  return {
    id: `merch-${m.merchId}`,
    cat,
    name: m.name,
    variant: m.description ?? "",
    price: m.pointCost,
    icon: merchIcon(cat),
    imageUrl: m.imageUrl,
    hasSizes,
    ariaLabel: `${m.name}, ${formatXp(m.pointCost)} XP`,
    requiresDelivery: true,
    source: "merch",
    merchId: m.merchId,
    variants: m.variants,
  };
}
