"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { formatXp } from "@/lib/format";
import { XP_REWARDS } from "@/lib/rewards";

/**
 * StoreRailRight — page-specific right rail for /store.
 * Shows the "How to earn XP?" guide instead of the default Cohor card.
 *
 * Now fully internationalized (was hard-coded Serbian) and reward amounts are
 * pulled from the shared XP_REWARDS constant so they can never drift from the
 * amounts shown in BuyModal.
 */

const M = {
  railAria:     { en: "How to earn XP",            sr: "Kako zaraditi XP" },
  earnTitle:    { en: "How to earn XP?",           sr: "Kako zaraditi XP?" },
  upTo:         { en: "Up to",                     sr: "Do" },
  daily:        { en: "daily",                     sr: "dnevno" },
  rowWin:       { en: "Win a hackathon",           sr: "Pobedi na hackathonu" },
  rowMinigame:  { en: "Daily Minigame",            sr: "Daily Minigame" },
  rowSpin:      { en: "Daily Spin",                sr: "Daily Spin" },
  rowJoin:      { en: "Hackathon participation",   sr: "Učešće na hackathonu" },
  rowRefer:     { en: "Refer a friend",            sr: "Preporuči prijatelja" },
  copyright:    { en: "© 2026",                    sr: "© 2026" },
} as const;

export function StoreRailRight() {
  const t = useT(M);

  // Render a reward amount: "Up to +5 000 XP" / "+300 XP" / "Up to +150 XP daily".
  const reward = (key: keyof typeof XP_REWARDS, suffix?: string): string => {
    const r = XP_REWARDS[key];
    const prefix = r.kind === "upTo" ? `${t("upTo")} ` : "";
    const tail = suffix ? ` ${suffix}` : "";
    return `${prefix}+${formatXp(r.amount)} XP${tail}`;
  };

  return (
    <aside className="rail-right" aria-label={t("railAria")}>
      <section className="card" aria-labelledby="earn-title">
        <header className="card-h">
          <h2 id="earn-title">{t("earnTitle")}</h2>
          <Link href="/gamehub">GameHub</Link>
        </header>
        <div className="earn-list">
          <div className="earn-row">
            <span className="earn-dot d-lemon" aria-hidden="true">
              <Icon name="trophy" />
            </span>
            <div className="earn-info">
              <div className="earn-name">{t("rowWin")}</div>
              <div className="earn-sub">{reward("hackathonWin")}</div>
            </div>
          </div>
          <div className="earn-row">
            <span className="earn-dot d-violet" aria-hidden="true">
              <Icon name="gamehub" />
            </span>
            <div className="earn-info">
              <div className="earn-name">{t("rowMinigame")}</div>
              <div className="earn-sub">{reward("dailyMinigame", t("daily"))}</div>
            </div>
          </div>
          <div className="earn-row">
            <span className="earn-dot d-violet" aria-hidden="true">
              <Icon name="flame" />
            </span>
            <div className="earn-info">
              <div className="earn-name">{t("rowSpin")}</div>
              <div className="earn-sub">{reward("dailySpin")}</div>
            </div>
          </div>
          <div className="earn-row">
            <span className="earn-dot d-green" aria-hidden="true">
              <Icon name="hackathon" />
            </span>
            <div className="earn-info">
              <div className="earn-name">{t("rowJoin")}</div>
              <div className="earn-sub">{reward("hackathonJoin")}</div>
            </div>
          </div>
          <div className="earn-row">
            <span className="earn-dot d-violet" aria-hidden="true">
              <Icon name="teams" />
            </span>
            <div className="earn-info">
              <div className="earn-name">{t("rowRefer")}</div>
              <div className="earn-sub">{reward("referFriend")}</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mini">
        <span className="cw">
          <b>tiki</b>miki
        </span>{" "}
        {t("copyright")}
      </footer>
    </aside>
  );
}

export default StoreRailRight;
