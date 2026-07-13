"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

const M = {
  title: { en: "Privacy Policy", sr: "Politika privatnosti" },
  updated: { en: "Last updated July 1, 2026", sr: "Poslednje ažurirano 1. jula 2026." },
  lead: {
    en: "This page explains what tikimiki collects while you use the platform, why, and what control you have over it.",
    sr: "Ova stranica objašnjava šta tikimiki prikuplja dok koristiš platformu, zašto, i kakvu kontrolu nad tim imaš.",
  },
  hCollect: { en: "What we collect", sr: "Šta prikupljamo" },
  liAccountLabel: { en: "Account data", sr: "Podaci naloga" },
  liAccountBody: {
    en: "email, username, password (hashed, never stored in plain text), and any avatar or banner image you upload.",
    sr: "email, korisničko ime, lozinka (heširana, nikad se ne čuva u čistom tekstu), i svaka slika avatara ili banera koju otpremiš.",
  },
  liHackathonLabel: { en: "Hackathon data", sr: "Podaci o hakatonima" },
  liHackathonBody: {
    en: "your applications and answers to an organizer's custom questions, team memberships, and — if you connect it — your GitHub username plus the languages and frameworks we detect for skill verification.",
    sr: "tvoje prijave i odgovori na prilagođena pitanja organizatora, članstva u timovima, i — ukoliko ga povežeš — tvoje GitHub korisničko ime plus jezici i frejmvorci koje detektujemo radi verifikacije veština.",
  },
  liCommsLabel: { en: "Communication data", sr: "Podaci komunikacije" },
  liCommsBody: {
    en: "messages, reactions and direct messages sent inside a hackathon's Cohor server, scoped to the members of that server or conversation.",
    sr: "poruke, reakcije i direktne poruke poslate unutar Cohor servera hakatona, dostupne članovima tog servera ili konverzacije.",
  },
  liUsageLabel: { en: "Usage data", sr: "Podaci o korišćenju" },
  liUsageBody: {
    en: "preferences like your chosen language and theme, and notification settings — stored to make the app work the way you left it.",
    sr: "podešavanja poput izabranog jezika i teme, i podešavanja notifikacija — čuvaju se da bi aplikacija radila onako kako si je ostavio/la.",
  },
  hUse: { en: "How we use it", sr: "Kako to koristimo" },
  pUse: {
    en: "To run the core product: matching you to hackathons, showing organizers the applications for their own events, ranking the leaderboard, sending notifications you've opted into, and keeping your session signed in. We don't sell your data, and we don't use it for third-party advertising.",
    sr: "Da bismo pokrenuli osnovni proizvod: povezivanje sa hakatonima, prikazivanje organizatorima prijava za njihove sopstvene evente, rangiranje na rang listi, slanje notifikacija na koje si pristao/la, i održavanje tvoje sesije prijavljenom. Ne prodajemo tvoje podatke i ne koristimo ih za oglašavanje trećih strana.",
  },
  hShare: { en: "Who can see it", sr: "Ko to može da vidi" },
  pShare: {
    en: "Application answers are visible only to the organizers of the hackathon you applied to. Teammates can see each other's profile and messages within their shared team channel. Anything you mark public on your profile (display name, avatar, verified skills) is visible platform-wide.",
    sr: "Odgovori u prijavi su vidljivi samo organizatorima hakatona na koji si se prijavio/la. Članovi tima vide profil i poruke jedni drugih unutar zajedničkog kanala tima. Sve što označiš kao javno na profilu (prikazano ime, avatar, verifikovane veštine) vidljivo je na celoj platformi.",
  },
  hRetention: { en: "How long we keep it", sr: "Koliko dugo čuvamo podatke" },
  pRetention: {
    en: "We keep your data while your account is active. You can delete uploaded media or edit your profile at any time in Settings; to delete your account entirely, contact support and we'll remove your personal data within a reasonable period, except where we're required to retain records (e.g. active hackathon results).",
    sr: "Podatke čuvamo dok je tvoj nalog aktivan. Otpremljene medije možeš obrisati ili urediti profil u bilo kom trenutku u Podešavanjima; za potpuno brisanje naloga kontaktiraj podršku i uklonićemo tvoje lične podatke u razumnom roku, osim gde smo obavezni da zadržimo evidenciju (npr. aktivni rezultati hakatona).",
  },
  hCookies: { en: "Cookies & local storage", sr: "Kolačići i lokalno skladište" },
  pCookies: {
    en: "We use your browser's local storage to keep you signed in and to remember your language and theme choice. We don't use third-party advertising or tracking cookies.",
    sr: "Koristimo lokalno skladište pregledača da bismo te održali prijavljenim i zapamtili izbor jezika i teme. Ne koristimo kolačiće za oglašavanje ili praćenje trećih strana.",
  },
  hRights: { en: "Your rights", sr: "Tvoja prava" },
  pRightsPre: {
    en: "You can request an export or deletion of your personal data at any time by emailing",
    sr: "Možeš zatražiti izvoz ili brisanje svojih ličnih podataka u bilo kom trenutku slanjem emaila na",
  },
  pRightsPost: {
    en: ". We'll respond within a reasonable timeframe.",
    sr: ". Odgovorićemo u razumnom roku.",
  },
  crossAbout: { en: "About tikimiki", sr: "O tikimiki platformi" },
  crossTerms: { en: "Terms of Service", sr: "Uslovi korišćenja" },
  crossAccessibility: { en: "Accessibility", sr: "Pristupačnost" },
} as const;

export function PrivacyClient() {
  const t = useT(M);
  return (
    <AuthShell as="main" footerVariant="links">
      <section className="legal-card" aria-labelledby="legal-heading">
        <div className="legal-badge" aria-hidden="true">
          <Icon name="lock" />
        </div>
        <h1 className="legal-title" id="legal-heading">
          {t("title")}
        </h1>
        <p className="legal-updated">{t("updated")}</p>
        <p className="legal-lead">{t("lead")}</p>

        <h2 className="legal-h2">{t("hCollect")}</h2>
        <ul className="legal-list">
          <li>
            <strong>{t("liAccountLabel")}</strong> — {t("liAccountBody")}
          </li>
          <li>
            <strong>{t("liHackathonLabel")}</strong> — {t("liHackathonBody")}
          </li>
          <li>
            <strong>{t("liCommsLabel")}</strong> — {t("liCommsBody")}
          </li>
          <li>
            <strong>{t("liUsageLabel")}</strong> — {t("liUsageBody")}
          </li>
        </ul>

        <h2 className="legal-h2">{t("hUse")}</h2>
        <p className="legal-p">{t("pUse")}</p>

        <h2 className="legal-h2">{t("hShare")}</h2>
        <p className="legal-p">{t("pShare")}</p>

        <h2 className="legal-h2">{t("hRetention")}</h2>
        <p className="legal-p">{t("pRetention")}</p>

        <h2 className="legal-h2">{t("hCookies")}</h2>
        <p className="legal-p">{t("pCookies")}</p>

        <h2 className="legal-h2">{t("hRights")}</h2>
        <p className="legal-p">
          {t("pRightsPre")} <strong>privacy@tikimiki.dev</strong>
          {t("pRightsPost")}
        </p>

        <hr className="legal-divider" />
        <div className="legal-cross">
          <Link href="/about">{t("crossAbout")}</Link>
          <span>·</span>
          <Link href="/terms">{t("crossTerms")}</Link>
          <span>·</span>
          <Link href="/accessibility">{t("crossAccessibility")}</Link>
        </div>
      </section>
    </AuthShell>
  );
}

export default PrivacyClient;
