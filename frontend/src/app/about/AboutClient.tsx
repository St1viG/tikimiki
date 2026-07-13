"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

const M = {
  back: { en: "Back", sr: "Nazad" },
  title: { en: "About tikimiki", sr: "O tikimiki platformi" },
  lead: {
    en: "tikimiki is an all-in-one hackathon platform: discover hackathons, apply and form a team, then run the whole event — chat, project submission, judging and results — without leaving the app.",
    sr: "tikimiki je all-in-one platforma za hakatone: pronađi hakatone, prijavi se i formiraj tim, a zatim odradi ceo event — chat, predaju projekta, ocenjivanje i rezultate — bez izlaska iz aplikacije.",
  },
  hWhat: { en: "What tikimiki does", sr: "Šta tikimiki radi" },
  pWhat: {
    en: "Organizations publish hackathons — virtual, physical or hybrid — with their own timeline, team-size limits, custom application questions and prizes. Once an event is live, every participant gets a dedicated Discord-style space (we call it Cohor) with channels for announcements, general chat, and a per-team kanban board for tracking work.",
    sr: "Organizacije objavljuju hakatone — virtuelne, fizičke ili hibridne — sa sopstvenom vremenskom linijom, ograničenjem veličine tima, prilagođenim pitanjima za prijavu i nagradama. Kada je event aktivan, svaki učesnik dobija poseban Discord-stil prostor (zovemo ga Cohor) sa kanalima za najave, opšti chat i kanban tablu po timu za praćenje rada.",
  },
  hParticipants: { en: "For participants", sr: "Za učesnike" },
  pParticipants: {
    en: "Browse hackathons by theme, location or format, apply with a short custom form, and get matched into a team. Link your GitHub account to have your languages and frameworks verified automatically — verified skills show up on your profile and help teammates and organizers see what you actually work with.",
    sr: "Pretraži hakatone po temi, lokaciji ili formatu, prijavi se kratkom prilagođenom formom i pridruži se timu. Poveži GitHub nalog da bi ti se jezici i frejmvorci automatski verifikovali — verifikovane veštine se prikazuju na profilu i pomažu timovima i organizatorima da vide čime se stvarno baviš.",
  },
  hOrganizers: { en: "For organizers", sr: "Za organizatore" },
  pOrganizers: {
    en: "Organization accounts get a manage dashboard to publish drafts, review and approve applications, message applicants, and track participants and teams in real time — plus a moderation layer (roles, channel permissions, bans) for the event's Cohor server.",
    sr: "Organizacioni nalozi dobijaju dashboard za upravljanje: objavljivanje nacrta, pregled i odobravanje prijava, poruke prijavljenima, i praćenje učesnika i timova u realnom vremenu — plus sloj moderacije (uloge, dozvole kanala, banovi) za Cohor server eventa.",
  },
  hCommunity: { en: "Beyond the hackathon", sr: "Van hakatona" },
  pCommunity: {
    en: "A leaderboard tracks standout participants across events, and an optional premium tier adds cosmetic extras (profile flair, store items) for people who want to support the platform. None of it gates the core hackathon workflow.",
    sr: "Rang lista prati istaknute učesnike kroz evente, a opcioni premium nivo dodaje kozmetičke dodatke (ukrasi profila, predmeti u prodavnici) za one koji žele da podrže platformu. Ništa od toga ne uslovljava osnovni tok hakatona.",
  },
  crossHelp: {
    en: "Have questions? Visit the Help Center",
    sr: "Imaš pitanja? Poseti Centar za pomoć",
  },
  crossPrivacy: { en: "Privacy Policy", sr: "Politika privatnosti" },
  crossTerms: { en: "Terms of Service", sr: "Uslovi korišćenja" },
} as const;

export function AboutClient() {
  const t = useT(M);
  return (
    <AuthShell as="main" footerVariant="links">
      <section className="legal-card" aria-labelledby="legal-heading">
        <Link className="legal-back" href="/">
          <Icon name="arrow-left" />
          {t("back")}
        </Link>
        <div className="legal-badge" aria-hidden="true">
          <Icon name="sparkles" />
        </div>
        <h1 className="legal-title" id="legal-heading">
          {t("title")}
        </h1>
        <p className="legal-lead">{t("lead")}</p>

        <h2 className="legal-h2">{t("hWhat")}</h2>
        <p className="legal-p">{t("pWhat")}</p>

        <h2 className="legal-h2">{t("hParticipants")}</h2>
        <p className="legal-p">{t("pParticipants")}</p>

        <h2 className="legal-h2">{t("hOrganizers")}</h2>
        <p className="legal-p">{t("pOrganizers")}</p>

        <h2 className="legal-h2">{t("hCommunity")}</h2>
        <p className="legal-p">{t("pCommunity")}</p>

        <hr className="legal-divider" />
        <div className="legal-cross">
          <Link href="/help">{t("crossHelp")}</Link>
          <span>·</span>
          <Link href="/privacy">{t("crossPrivacy")}</Link>
          <span>·</span>
          <Link href="/terms">{t("crossTerms")}</Link>
        </div>
      </section>
    </AuthShell>
  );
}

export default AboutClient;
