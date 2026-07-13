"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

const M = {
  back: { en: "Back", sr: "Nazad" },
  title: { en: "Accessibility statement", sr: "Izjava o pristupačnosti" },
  updated: { en: "Last updated July 1, 2026", sr: "Poslednje ažurirano 1. jula 2026." },
  lead: {
    en: "tikimiki is used by participants and organizers with a wide range of abilities, on everything from a laptop to a phone at 2am during a hackathon. We build accessibility into the product rather than bolting it on afterward.",
    sr: "tikimiki koriste učesnici i organizatori sa širokim rasponom sposobnosti, na svemu od laptopa do telefona u 2 ujutru tokom hakatona. Pristupačnost gradimo u proizvod, a ne dodajemo je naknadno.",
  },
  hStandard: { en: "Conformance target", sr: "Ciljni standard" },
  pStandard: {
    en: "We aim to meet WCAG 2.1 level AA across the app. We treat this as an ongoing target, not a one-time checkbox — new features are reviewed against it before release, and gaps we find get tracked and fixed.",
    sr: "Cilj nam je da ispunimo WCAG 2.1 nivo AA kroz celu aplikaciju. Ovo tretiramo kao stalni cilj, a ne jednokratnu proveru — nove funkcionalnosti se proveravaju pre objave, a propusti koje pronađemo se prate i ispravljaju.",
  },
  hFeatures: { en: "What's already in place", sr: "Šta je već implementirano" },
  liKeyboardLabel: { en: "Keyboard navigation", sr: "Navigacija tastaturom" },
  liKeyboardBody: {
    en: "across menus, dialogs, the Cohor chat and application forms — nothing requires a mouse.",
    sr: "kroz menije, dijaloge, Cohor chat i forme za prijavu — ništa ne zahteva miša.",
  },
  liFocusLabel: { en: "Visible focus outlines", sr: "Vidljivi focus okviri" },
  liFocusBody: {
    en: "on every interactive element, styled consistently instead of relying on default browser behavior.",
    sr: "na svakom interaktivnom elementu, stilizovani dosledno umesto oslanjanja na podrazumevano ponašanje pregledača.",
  },
  liSemanticsLabel: { en: "Semantic structure", sr: "Semantička struktura" },
  liSemanticsBody: {
    en: "real headings, landmarks and ARIA labels, plus screen-reader-only text on icon-only controls.",
    sr: "prava zaglavlja, landmark elementi i ARIA oznake, plus tekst samo za čitače ekrana na kontrolama koje su samo ikonica.",
  },
  liThemeLabel: { en: "Theme options", sr: "Opcije teme" },
  liThemeBody: {
    en: "including a grayscale high-contrast theme for users who find color-coded status harder to read.",
    sr: "uključujući sivu temu visokog kontrasta za korisnike kojima je status u boji teže čitljiv.",
  },
  liMotionLabel: { en: "Reduced motion", sr: "Smanjen pokret" },
  liMotionBody: {
    en: 'animations (loading states, transitions) respect your OS-level "reduce motion" setting.',
    sr: 'animacije (učitavanje, prelazi) poštuju sistemsko podešavanje "smanji pokret".',
  },
  hKnown: { en: "Known limitations", sr: "Poznata ograničenja" },
  pKnown: {
    en: "Some real-time parts of Cohor (live typing indicators, drag-and-drop kanban cards) don't yet have a fully equivalent screen-reader experience. We're actively working through these — if one of them blocks you, tell us and we'll prioritize it.",
    sr: "Neki delovi Cohor-a u realnom vremenu (indikatori kucanja uživo, prevlačenje kanban kartica) još nemaju potpuno ekvivalentno iskustvo za čitače ekrana. Aktivno radimo na tome — ako te nešto od toga blokira, javi nam i prioritetno ćemo to rešiti.",
  },
  hContact: { en: "Report an issue", sr: "Prijavi problem" },
  pContactPre: {
    en: "Found something that doesn't work with your keyboard, screen reader or other assistive technology? Email",
    sr: "Naišao si na nešto što ne radi sa tastaturom, čitačem ekrana ili drugom asistivnom tehnologijom? Pošalji email na",
  },
  pContactPost: {
    en: "with the page and what happened — we read every report.",
    sr: "sa stranicom i opisom problema — čitamo svaku prijavu.",
  },
  crossAbout: { en: "About tikimiki", sr: "O tikimiki platformi" },
  crossPrivacy: { en: "Privacy Policy", sr: "Politika privatnosti" },
  crossHelp: { en: "Help Center", sr: "Centar za pomoć" },
} as const;

export function AccessibilityClient() {
  const t = useT(M);
  return (
    <AuthShell as="main" footerVariant="links">
      <section className="legal-card" aria-labelledby="legal-heading">
        <Link className="legal-back" href="/">
          <Icon name="arrow-left" />
          {t("back")}
        </Link>
        <div className="legal-badge" aria-hidden="true">
          <Icon name="eye" />
        </div>
        <h1 className="legal-title" id="legal-heading">
          {t("title")}
        </h1>
        <p className="legal-updated">{t("updated")}</p>
        <p className="legal-lead">{t("lead")}</p>

        <h2 className="legal-h2">{t("hStandard")}</h2>
        <p className="legal-p">{t("pStandard")}</p>

        <h2 className="legal-h2">{t("hFeatures")}</h2>
        <ul className="legal-list">
          <li>
            <strong>{t("liKeyboardLabel")}</strong> {t("liKeyboardBody")}
          </li>
          <li>
            <strong>{t("liFocusLabel")}</strong> {t("liFocusBody")}
          </li>
          <li>
            <strong>{t("liSemanticsLabel")}</strong> {t("liSemanticsBody")}
          </li>
          <li>
            <strong>{t("liThemeLabel")}</strong> {t("liThemeBody")}
          </li>
          <li>
            <strong>{t("liMotionLabel")}</strong> {t("liMotionBody")}
          </li>
        </ul>

        <h2 className="legal-h2">{t("hKnown")}</h2>
        <p className="legal-p">{t("pKnown")}</p>

        <h2 className="legal-h2">{t("hContact")}</h2>
        <p className="legal-p">
          {t("pContactPre")} <strong>accessibility@tikimiki.dev</strong> {t("pContactPost")}
        </p>

        <hr className="legal-divider" />
        <div className="legal-cross">
          <Link href="/about">{t("crossAbout")}</Link>
          <span>·</span>
          <Link href="/privacy">{t("crossPrivacy")}</Link>
          <span>·</span>
          <Link href="/help">{t("crossHelp")}</Link>
        </div>
      </section>
    </AuthShell>
  );
}

export default AccessibilityClient;
