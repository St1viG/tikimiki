"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

const M = {
  title: { en: "Terms of Service", sr: "Uslovi korišćenja" },
  updated: { en: "Last updated July 1, 2026", sr: "Poslednje ažurirano 1. jula 2026." },
  lead: {
    en: "These are the ground rules for using tikimiki, whether you're applying to a hackathon or organizing one.",
    sr: "Ovo su osnovna pravila za korišćenje tikimiki-ja, bilo da se prijavljuješ na hakaton ili ga organizuješ.",
  },
  hAccounts: { en: "Accounts", sr: "Nalozi" },
  pAccounts: {
    en: "One account per person. Keep your email and profile information accurate, and keep your password to yourself — you're responsible for activity that happens under your account.",
    sr: "Jedan nalog po osobi. Drži svoj email i podatke profila tačnim, i čuvaj lozinku za sebe — odgovoran/na si za aktivnost koja se dešava pod tvojim nalogom.",
  },
  hOrganizers: { en: "Organizer accounts", sr: "Organizatorski nalozi" },
  pOrganizers: {
    en: "Organization accounts are reviewed by our admin team before they're marked verified. Once a hackathon is published, organizers are expected to honor its stated dates, team-size limits and prizes, and to review applications in good faith.",
    sr: "Organizacioni nalozi prolaze kroz pregled našeg admin tima pre nego što budu označeni kao verifikovani. Kada je hakaton objavljen, od organizatora se očekuje da poštuju navedene datume, ograničenja veličine tima i nagrade, i da prijave pregledaju u dobroj veri.",
  },
  hConduct: { en: "Acceptable use", sr: "Prihvatljivo korišćenje" },
  pConduct: {
    en: "No harassment, hate speech, spam or impersonation — in Cohor chat, application forms, team channels or anywhere else on the platform. Project submissions must be your team's own work. Violations can lead to a warning, a temporary suspension, or account termination depending on severity; suspended accounts can submit one appeal for review.",
    sr: "Bez uznemiravanja, govora mržnje, spama ili lažnog predstavljanja — u Cohor chat-u, formama za prijavu, kanalima tima ili bilo gde drugde na platformi. Predati projekti moraju biti sopstveni rad tima. Kršenja mogu dovesti do upozorenja, privremene suspenzije ili gašenja naloga u zavisnosti od ozbiljnosti; suspendovani nalozi mogu podneti jednu žalbu na razmatranje.",
  },
  hContent: { en: "Your content", sr: "Tvoj sadržaj" },
  pContent: {
    en: "You keep ownership of what you submit — code, write-ups, images. By submitting to a hackathon you grant tikimiki and the organizing account a license to display it for judging, results and the leaderboard.",
    sr: "Zadržavaš vlasništvo nad onim što predaš — kod, opise, slike. Predajom na hakaton daješ tikimiki-ju i organizacionom nalogu licencu da to prikažu radi ocenjivanja, rezultata i rang liste.",
  },
  hPremium: { en: "Premium & store", sr: "Premium i prodavnica" },
  pPremium: {
    en: "Premium subscriptions and store items are virtual goods tied to your account. Purchases are generally non-refundable except where required by law — reach out to support if something went wrong with a charge.",
    sr: "Premium pretplate i predmeti iz prodavnice su virtuelna dobra vezana za tvoj nalog. Kupovine su generalno nepovratne osim gde je to zakonom propisano — javi se podršci ako je nešto pošlo po zlu sa naplatom.",
  },
  hTermination: { en: "Suspension & termination", sr: "Suspenzija i gašenje naloga" },
  pTermination: {
    en: "We can suspend or terminate accounts that violate these terms. You can also close your own account at any time from Settings, or by contacting support.",
    sr: "Možemo suspendovati ili ugasiti naloge koji krše ove uslove. Takođe možeš u bilo kom trenutku zatvoriti sopstveni nalog iz Podešavanja, ili kontaktiranjem podrške.",
  },
  crossAbout: { en: "About tikimiki", sr: "O tikimiki platformi" },
  crossPrivacy: { en: "Privacy Policy", sr: "Politika privatnosti" },
  crossHelp: { en: "Help Center", sr: "Centar za pomoć" },
} as const;

export function TermsClient() {
  const t = useT(M);
  return (
    <AuthShell as="main" footerVariant="links">
      <section className="legal-card" aria-labelledby="legal-heading">
        <div className="legal-badge" aria-hidden="true">
          <Icon name="flag" />
        </div>
        <h1 className="legal-title" id="legal-heading">
          {t("title")}
        </h1>
        <p className="legal-updated">{t("updated")}</p>
        <p className="legal-lead">{t("lead")}</p>

        <h2 className="legal-h2">{t("hAccounts")}</h2>
        <p className="legal-p">{t("pAccounts")}</p>

        <h2 className="legal-h2">{t("hOrganizers")}</h2>
        <p className="legal-p">{t("pOrganizers")}</p>

        <h2 className="legal-h2">{t("hConduct")}</h2>
        <p className="legal-p">{t("pConduct")}</p>

        <h2 className="legal-h2">{t("hContent")}</h2>
        <p className="legal-p">{t("pContent")}</p>

        <h2 className="legal-h2">{t("hPremium")}</h2>
        <p className="legal-p">{t("pPremium")}</p>

        <h2 className="legal-h2">{t("hTermination")}</h2>
        <p className="legal-p">{t("pTermination")}</p>

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

export default TermsClient;
