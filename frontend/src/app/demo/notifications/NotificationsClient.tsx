"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { NotificationPopup } from "@/components/popups/NotificationPopup";
import { useT } from "@/components/i18n/LanguageProvider";

/* NotificationsClient — interactive demo for the NotificationPopup component.
 *
 * AppShell uses variant "no-right". The demo shows a bell button in the page-head
 * that opens <NotificationPopup/>, plus a demo-stage card with a second trigger.
 * The .demo-note is position:fixed and rendered as a sibling to AppShell (via a
 * fragment) so it escapes the .shell grid.
 *
 * Supplies its own `<main id="main">`; popup interactivity lives in
 * <NotificationPopup/>.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Notifications", sr: "Notifikacije" },
  pageSub: {
    en: "Component demo · notification dropdown",
    sr: "Demo komponente · padajući prozor sa notifikacijama",
  },
  searchLabel: { en: "Search", sr: "Pretraži" },
  searchPlaceholder: { en: "Search…", sr: "Pretraži…" },
  demoEyebrow: { en: "Component demo", sr: "Demo komponente" },
  demoText: {
    en: "Click the bell in the top navigation to open notifications.",
    sr: "Klikni na zvonce u gornjoj navigaciji da otvoriš notifikacije.",
  },
  demoNoteBell: {
    en: "Demo page · click the bell in the navigation",
    sr: "Demo stranica · klikni na zvonce u navigaciji",
  },
} as const;

export function NotificationsClient() {
  const t = useT(M);

  return (
    <>
      <AppShell variant="no-right">
        <main id="main">
          <div className="page-head">
            <Link className="col-back" href="/" aria-label={t("backLabel")}>
              <Icon name="arrow-left" />
            </Link>
            <div className="col-titles">
              <h1 className="page-title">
                <Icon name="bell" /> {t("pageTitle")}
              </h1>
              <p className="page-sub">{t("pageSub")}</p>
            </div>

            {/* Demo trigger: bell with notification dropdown */}
            <NotificationPopup />

            <div className="search" role="search">
              <Icon name="search" />
              <input
                type="search"
                aria-label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
              />
            </div>
          </div>

          <div className="demo-stage spotlight">
            <Icon name="bell" className="stage-ghost" />
            <span className="demo-ic" aria-hidden="true">
              <Icon name="bell" />
            </span>
            <span className="stage-eyebrow">{t("demoEyebrow")}</span>
            <p>{t("demoText")}</p>
          </div>
        </main>
      </AppShell>

      {/* Fixed toast-style hint at the bottom of the viewport — rendered
          outside the .shell grid so position:fixed is relative to the viewport. */}
      <div className="demo-note">
        <Icon name="bell" /> {t("demoNoteBell")}
      </div>
    </>
  );
}

export default NotificationsClient;
