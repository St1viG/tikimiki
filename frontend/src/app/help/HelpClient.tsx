"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

const M = {
  back: { en: "Back", sr: "Nazad" },
  title: { en: "Help Center", sr: "Centar za pomoć" },
  lead: {
    en: "Quick answers to the questions we hear most. Can't find yours? Email us at the bottom of the page.",
    sr: "Brzi odgovori na pitanja koja najčešće čujemo. Ne nalaziš svoje? Pošalji nam email na dnu stranice.",
  },
  hStart: { en: "Getting started", sr: "Prvi koraci" },
  qFind: { en: "How do I find a hackathon?", sr: "Kako da pronađem hakaton?" },
  aFind: {
    en: "Open Hackathons from the main navigation — currently live and upcoming events are listed there, filterable by theme, location and format (virtual, physical, hybrid).",
    sr: "Otvori Hakatoni iz glavne navigacije — trenutno aktivni i predstojeći eventi su tu prikazani, filtrirani po temi, lokaciji i formatu (virtuelan, fizički, hibridni).",
  },
  qApply: { en: "How do I apply?", sr: "Kako da se prijavim?" },
  aApply: {
    en: "Open a hackathon's page and select Apply. You'll fill out the organizer's application form (some questions may be required); you can track your status from your profile once you've submitted it.",
    sr: "Otvori stranicu hakatona i izaberi Prijavi se. Popunićeš formu za prijavu koju je postavio organizator (neka pitanja mogu biti obavezna); status možeš pratiti sa svog profila nakon što je pošalješ.",
  },
  qGithub: {
    en: "What does GitHub skill verification do?",
    sr: "Šta radi verifikacija veština preko GitHub-a?",
  },
  aGithub: {
    en: "Connect your GitHub account in Settings and we detect the languages and frameworks you actually use across your repositories. Verified skills appear on your profile with a badge, so teammates and organizers know they're accurate.",
    sr: "Poveži svoj GitHub nalog u Podešavanjima i detektujemo jezike i frejmvorke koje zaista koristiš u svojim repozitorijumima. Verifikovane veštine se prikazuju na profilu sa značkom, tako da timovi i organizatori znaju da su tačne.",
  },
  hParticipants: { en: "For participants", sr: "Za učesnike" },
  qTeam: { en: "How do I join or form a team?", sr: "Kako da se pridružim timu ili formiram tim?" },
  aTeam: {
    en: "Team formation happens inside a hackathon's Cohor server once you're accepted — invite people you know, or use the team-suggestions view to find teammates with complementary skills.",
    sr: "Formiranje tima se dešava unutar Cohor servera hakatona nakon što budeš prihvaćen/a — pozovi ljude koje znaš, ili koristi prikaz predloga timova da nađeš saigrače sa komplementarnim veštinama.",
  },
  qCohor: { en: "What is Cohor?", sr: "Šta je Cohor?" },
  aCohor: {
    en: "Cohor is the built-in chat that comes with every hackathon — a Discord-style space with announcement and general channels, direct messages, and a kanban board per team for tracking your project's progress.",
    sr: "Cohor je ugrađeni chat koji dolazi uz svaki hakaton — Discord-stil prostor sa kanalima za najave i opšti chat, direktnim porukama, i kanban tablom po timu za praćenje napretka projekta.",
  },
  hOrganizers: { en: "For organizers", sr: "Za organizatore" },
  qCreate: { en: "How do I create a hackathon?", sr: "Kako da napravim hakaton?" },
  aCreate: {
    en: "From an organization account, go to Manage hackathons and start a new one — you can save it as a draft before publishing. Publishing automatically creates the event's Cohor server and channels.",
    sr: "Sa organizacionog naloga, idi na Upravljanje hakatonima i pokreni novi — možeš ga sačuvati kao nacrt pre objavljivanja. Objavljivanje automatski kreira Cohor server i kanale za event.",
  },
  qReview: { en: "How do I review applications?", sr: "Kako da pregledam prijave?" },
  aReview: {
    en: "Open Applications from Manage hackathons for the event you want — you can filter by skills or GitHub verification, sort candidates, and approve or reject each one from its card.",
    sr: "Otvori Prijave iz Upravljanja hakatonima za event koji želiš — možeš filtrirati po veštinama ili GitHub verifikaciji, sortirati kandidate, i odobriti ili odbiti svakog sa njegove kartice.",
  },
  qVerify: {
    en: "Why isn't my organization verified yet?",
    sr: "Zašto moja organizacija još nije verifikovana?",
  },
  aVerify: {
    en: "New organization accounts start as pending until our admin team reviews them. This usually takes a few business days; verified organizers get a badge shown next to their hackathons.",
    sr: "Novi organizacioni nalozi počinju kao na čekanju dok ih naš admin tim ne pregleda. Ovo obično traje nekoliko radnih dana; verifikovani organizatori dobijaju značku prikazanu pored njihovih hakatona.",
  },
  hContact: { en: "Still stuck?", sr: "Još uvek imaš problem?" },
  pContact: {
    en: "Email us at",
    sr: "Pošalji nam email na",
  },
  pContactPost: {
    en: "and we'll get back to you.",
    sr: "i javićemo ti se.",
  },
  crossAbout: { en: "About tikimiki", sr: "O tikimiki platformi" },
  crossPrivacy: { en: "Privacy Policy", sr: "Politika privatnosti" },
  crossTerms: { en: "Terms of Service", sr: "Uslovi korišćenja" },
} as const;

export function HelpClient() {
  const t = useT(M);
  return (
    <AuthShell as="main" footerVariant="links">
      <section className="legal-card" aria-labelledby="legal-heading">
        <Link className="legal-back" href="/">
          <Icon name="arrow-left" />
          {t("back")}
        </Link>
        <div className="legal-badge" aria-hidden="true">
          <Icon name="mail" />
        </div>
        <h1 className="legal-title" id="legal-heading">
          {t("title")}
        </h1>
        <p className="legal-lead">{t("lead")}</p>

        <h2 className="legal-h2">{t("hStart")}</h2>
        <p className="legal-p">
          <strong>{t("qFind")}</strong>
          <br />
          {t("aFind")}
        </p>
        <p className="legal-p">
          <strong>{t("qApply")}</strong>
          <br />
          {t("aApply")}
        </p>
        <p className="legal-p">
          <strong>{t("qGithub")}</strong>
          <br />
          {t("aGithub")}
        </p>

        <h2 className="legal-h2">{t("hParticipants")}</h2>
        <p className="legal-p">
          <strong>{t("qTeam")}</strong>
          <br />
          {t("aTeam")}
        </p>
        <p className="legal-p">
          <strong>{t("qCohor")}</strong>
          <br />
          {t("aCohor")}
        </p>

        <h2 className="legal-h2">{t("hOrganizers")}</h2>
        <p className="legal-p">
          <strong>{t("qCreate")}</strong>
          <br />
          {t("aCreate")}
        </p>
        <p className="legal-p">
          <strong>{t("qReview")}</strong>
          <br />
          {t("aReview")}
        </p>
        <p className="legal-p">
          <strong>{t("qVerify")}</strong>
          <br />
          {t("aVerify")}
        </p>

        <h2 className="legal-h2">{t("hContact")}</h2>
        <p className="legal-p">
          {t("pContact")} <strong>support@tikimiki.dev</strong> {t("pContactPost")}
        </p>

        <hr className="legal-divider" />
        <div className="legal-cross">
          <Link href="/about">{t("crossAbout")}</Link>
          <span>·</span>
          <Link href="/privacy">{t("crossPrivacy")}</Link>
          <span>·</span>
          <Link href="/terms">{t("crossTerms")}</Link>
        </div>
      </section>
    </AuthShell>
  );
}

export default HelpClient;
