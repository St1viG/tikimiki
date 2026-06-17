/**
 * Single source of truth for tikimiki Premium pricing.
 *
 * Previously PremiumClient hard-coded these figures in four separate places
 * (the price toggle, the annual savings note, and the FAQ answer), which made
 * them easy to drift out of sync. All copy now derives from this constant.
 *
 * Figures (USD):
 *   - monthly         : 4.99  charged every month
 *   - annualPerMonth  : 4.16  effective per-month cost on the annual plan
 *   - annualTotal     : 49.99 charged once per year
 *   - monthlyAnnualized: 59.88 (= monthly × 12), shown struck-through
 *   - savePercent     : 17    rounded annual saving vs paying monthly
 */
export const PRICING = {
  currency: "$",
  monthly: 4.99,
  annualPerMonth: 4.16,
  annualTotal: 49.99,
  /** monthly × 12 — the "before" figure on the annual note. */
  monthlyAnnualized: 59.88,
  savePercent: 17,
} as const;

/** "4.99" — bare amount string with two decimals (no currency symbol). */
export function priceAmount(value: number): string {
  return value.toFixed(2);
}

/** "$4.99" — currency-prefixed amount. */
export function priceLabel(value: number): string {
  return `${PRICING.currency}${priceAmount(value)}`;
}
