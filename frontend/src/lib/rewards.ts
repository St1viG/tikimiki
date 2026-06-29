/**
 * Single source of truth for XP reward amounts shown across the app.
 *
 * Previously the "How to earn XP?" lists in StoreRailRight and BuyModal
 * disagreed (Daily Minigame was +50 in the rail but +150 in the modal). The
 * values below are the canonical, documented amounts — we standardized on the
 * larger/more complete set so both surfaces always agree.
 *
 * Standardized amounts (chosen 2026-06):
 *   - dailyMinigame   : 150  (was 50 in the rail, 150 in the modal → 150)
 *   - dailySpin       : 200  (consistent across both surfaces)
 *   - hackathonJoin   : 300  (consistent across both surfaces)
 *   - hackathonWin    : 5000 (consistent across both surfaces)
 *   - referFriend     : 100  (only present in the rail)
 *
 * `kind: "exact"` renders as "+N XP"; `kind: "upTo"` renders as "up to +N XP".
 */
export interface XpReward {
  /** Raw XP amount. */
  amount: number;
  /** Whether the amount is a fixed reward or an upper bound. */
  kind: "exact" | "upTo";
}

export const XP_REWARDS = {
  dailyMinigame: { amount: 150, kind: "upTo" },
  dailySpin: { amount: 200, kind: "upTo" },
  hackathonJoin: { amount: 300, kind: "exact" },
  hackathonWin: { amount: 5000, kind: "upTo" },
  referFriend: { amount: 100, kind: "exact" },
} as const satisfies Record<string, XpReward>;

export type XpRewardKey = keyof typeof XP_REWARDS;
