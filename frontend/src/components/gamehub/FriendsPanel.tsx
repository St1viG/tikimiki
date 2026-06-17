"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import {
  FRIENDS_TODAY,
  PLAYED_TODAY,
  TOTAL_GAMES,
} from "@/lib/gamehub/mock";
import { useT } from "@/components/i18n/LanguageProvider";

const M = {
  friendsToday: { en: "Friends today", sr: "Prijatelji danas" },
  dailyDuel: { en: "Daily duel", sr: "Dnevni duel" },
  today: { en: "today", sr: "danas" },
  gamesToday: { en: "games today", sr: "igara danas" },
  leadingAmong: {
    en: "You're leading among friends!",
    sr: "Vodiš među prijateljima!",
  },
  playFirst: { en: "Be the first to play today", sr: "Odigraj prvi danas" },
  leaderLeads: {
    en: "{name} leads with {completed}/{total}",
    sr: "{name} vodi sa {completed}/{total}",
  },
  all: { en: "All", sr: "Svi" },
  best: { en: "best:", sr: "najbolje:" },
  gamesAria: { en: "games", sr: "igara" },
  of: { en: "of", sr: "od" },
  about: { en: "About", sr: "O nama" },
  accessibility: { en: "Accessibility", sr: "Pristupačnost" },
  help: { en: "Help center", sr: "Centar za pomoć" },
  privacy: { en: "Privacy", sr: "Privatnost" },
} as const;

/**
 * FriendsPanel — the GameHub right rail (replaces the removed XP leaderboard +
 * achievements rail). "Prijatelji danas": each friend's generative avatar, name,
 * how many of today's daily games they've completed (X/N) and a standout
 * result. Up top, a friendly "dnevni duel" framing compares YOU vs friends by
 * games completed today. Strictly about TODAY's daily games — never global XP.
 */
export function FriendsPanel() {
  const t = useT(M);
  // Clicking a friend opens their profile popup (by @handle).
  const [popupUser, setPopupUser] = useState<string | null>(null);
  // How you rank among friends by games completed today (1 = leading).
  const ahead = FRIENDS_TODAY.filter((f) => f.completed > PLAYED_TODAY).length;
  const rank = ahead + 1;
  const leader = FRIENDS_TODAY[0];
  const leaderLine = (name: string, completed: number) =>
    t("leaderLeads")
      .replace("{name}", name)
      .replace("{completed}", String(completed))
      .replace("{total}", String(TOTAL_GAMES));

  return (
    <aside className="rail-right fp" aria-label={t("friendsToday")}>
      {/* Dnevni duel — you vs friends, by games completed today */}
      <section className="card fp-duel">
        <div className="card-h">
          <h2>{t("dailyDuel")}</h2>
          <span className="tag tag-l">
            <Icon name="flame" /> {t("today")}
          </span>
        </div>
        <div className="fp-duel-body">
          <div className="fp-you">
            <div className="fp-you-rank u-mono">#{rank}</div>
            <div className="fp-you-meta">
              <div className="fp-you-line">
                <b className="u-mono">
                  {PLAYED_TODAY}/{TOTAL_GAMES}
                </b>{" "}
                {t("gamesToday")}
              </div>
              <div className="fp-you-sub">
                {rank === 1
                  ? t("leadingAmong")
                  : leader
                    ? leaderLine(leader.name.split(" ")[0], leader.completed)
                    : t("playFirst")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Prijatelji danas — completion + standout per friend */}
      <section className="card">
        <div className="card-h">
          <h2>{t("friendsToday")}</h2>
        </div>
        <div className="fp-list">
          {FRIENDS_TODAY.map((f) => (
            <div
              className="fp-row fp-row-click"
              key={f.handle}
              role="button"
              tabIndex={0}
              aria-label={f.name}
              onClick={() => setPopupUser(f.handle)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPopupUser(f.handle);
                }
              }}
            >
              <span className="fp-av" aria-hidden="true">
                <GenerativeAvatar seed={f.handle} variant="orbit" size={36} />
              </span>
              <div className="fp-info">
                <div className="fp-name">{f.name}</div>
                {f.standout && (
                  <div className="fp-standout">
                    {t("best")}{" "}
                    <span className="u-mono">{f.standout.display}</span>
                  </div>
                )}
              </div>
              <span
                className="fp-count u-mono"
                aria-label={`${f.completed} ${t("of")} ${TOTAL_GAMES} ${t("gamesAria")}`}
              >
                {f.completed}/{TOTAL_GAMES}
              </span>
            </div>
          ))}
        </div>
      </section>

      <ProfilePopup
        open={popupUser !== null}
        username={popupUser}
        onClose={() => setPopupUser(null)}
      />

      <footer className="mini">
        <a href="#">{t("about")}</a> · <a href="#">{t("accessibility")}</a> ·{" "}
        <a href="#">{t("help")}</a> · <a href="#">{t("privacy")}</a>
        <br />
        <span className="cw">
          <b>tiki</b>miki
        </span>{" "}
        © 2026
      </footer>
    </aside>
  );
}

export default FriendsPanel;
