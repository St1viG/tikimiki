"use client";

/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  CandidatePopup,
  type Candidate,
  type CandidateStatus,
} from "@/components/popups/CandidatePopup";
import { RejectModal } from "@/components/popups/RejectModal";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import type {
  Applicant,
  ApplicantSortBy,
  Application,
  ApplicationAnswer,
  ApplicationQuestion,
  ApplicationStats,
} from "@/lib/api";
import type { HackathonSummary } from "@tikimiki/types";
import { initials, hashString, relTime, type Locale } from "@/lib/format";

/** Slugify a handle/name for use as a GenerativeAvatar seed. */
function toSeed(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, "");
}

/**
 * ApplicationsClient — the /applications surface.
 *
 * Two distinct experiences, gated on the signed-in account:
 *  • Organizers (and admins) get a hackathon picker over the hackathons they
 *    own (admins: all) with two tabs per hackathon — "Applicants" (review,
 *    approve/reject) and "Application form" (the question builder).
 *  • Plain members get a read-only list of their own applications.
 *
 * Nothing on this page is hardcoded: every figure comes from the backend, and
 * surfaces with no backing data are simply omitted.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Application management", sr: "Upravljanje prijavama" },
  pageSub: {
    en: "Review, approve and reject hackathon applications.",
    sr: "Pregledaj, odobri i odbij prijave za hackathon.",
  },
  pageSubMember: {
    en: "Track the hackathons you have applied to.",
    sr: "Prati hakatone na koje si se prijavio.",
  },

  // Hackathon picker
  pickLabel: { en: "Hackathon", sr: "Hackathon" },
  pickAria: { en: "Select hackathon to manage", sr: "Izaberi hackathon za upravljanje" },
  noHackathons: {
    en: "You don't manage any hackathons yet.",
    sr: "Još ne upravljaš nijednim hackathonom.",
  },
  noHackathonsCta: { en: "Create a hackathon", sr: "Napravi hackathon" },

  // Organizer view tabs
  viewApplicants: { en: "Applicants", sr: "Prijave" },
  viewForm: { en: "Application form", sr: "Forma za prijavu" },

  // Stats
  statTotal: { en: "Total applications", sr: "Ukupno prijava" },
  statPending: { en: "Pending", sr: "Na čekanju" },
  statApproved: { en: "Approved", sr: "Odobreno" },
  statRejected: { en: "Rejected", sr: "Odbijeno" },
  capLabel: { en: "Hackathon capacity", sr: "Kapacitet hackathona" },
  capSpots: { en: "approved spots", sr: "odobrenih mesta" },

  // Filter tabs
  tabFilterLabel: { en: "Filter by status", sr: "Filter po statusu" },
  tabPending: { en: "Pending", sr: "Na čekanju" },
  tabApproved: { en: "Approved", sr: "Odobrene" },
  tabRejected: { en: "Rejected", sr: "Odbijene" },
  tabAll: { en: "All", sr: "Sve" },
  approveAllBtn: { en: "Approve all", sr: "Odobri sve" },

  openCardAria: { en: "Open application", sr: "Otvori prijavu" },
  githubBadgeTitle: {
    en: "GitHub-verified skills",
    sr: "GitHub-verifikovane veštine",
  },
  quickActionsTitle: { en: "Quick actions", sr: "Brze akcije" },
  approveAllPending: { en: "Approve all pending", sr: "Odobri sve na čekanju" },
  pendingCountHint: { en: "applications waiting", sr: "prijave čekaju" },
  searchLabel: { en: "Search", sr: "Pretraži" },
  searchPh: { en: "Search…", sr: "Pretraži…" },

  filterSkillsLabel: { en: "Skills", sr: "Veštine" },
  filterSkillsPh: { en: "e.g. React, Go", sr: "npr. React, Go" },
  filterGithubLabel: { en: "GitHub", sr: "GitHub" },
  filterGithubAll: { en: "Anyone", sr: "Svi" },
  filterGithubVerified: { en: "Verified skills", sr: "Verifikovane veštine" },
  filterGithubUnverified: { en: "No verified skills", sr: "Bez verifikovanih veština" },
  sortLabel: { en: "Sort by", sr: "Sortiraj po" },
  sortRecent: { en: "Most recent", sr: "Najnovije" },
  sortSkills: { en: "Matching skills", sr: "Poklapanje veština" },
  sortGithub: { en: "GitHub verified", sr: "GitHub verifikacija" },

  toastApproved: { en: "Application approved", sr: "Prijava odobrena" },
  toastRejected: { en: "Application rejected", sr: "Prijava odbijena" },
  toastNoPending: { en: "No pending applications", sr: "Nema prijava na čekanju" },
  toastAllApproved: {
    en: "All pending applications approved",
    sr: "Sve prijave na čekanju su odobrene",
  },
  toastActionFailed: { en: "Action failed — reverted", sr: "Akcija nije uspela — vraćeno" },

  pillPending: { en: "Pending", sr: "Na čekanju" },
  pillApproved: { en: "Approved", sr: "Odobrena" },
  pillRejected: { en: "Rejected", sr: "Odbijen" },

  loadingApps: { en: "Loading applications…", sr: "Učitavanje prijava…" },
  emptyApps: { en: "No applications yet.", sr: "Još nema prijava." },
  aboutUs: { en: "About us", sr: "O nama" },
  accessibility: { en: "Accessibility", sr: "Pristupačnost" },
  privacy: { en: "Privacy", sr: "Privatnost" },
  hintApproved: { en: "Approved just now", sr: "Odobreno upravo" },
  hintRejected: { en: "Rejected just now", sr: "Odbijeno upravo" },
  showAnswers: { en: "Show application answers", sr: "Prikaži odgovore na prijavu" },
  hideAnswers: { en: "Hide answers", sr: "Sakrij odgovore" },
  answersLoading: { en: "Loading…", sr: "Učitavanje…" },
  answersEmpty: { en: "No answers for this application.", sr: "Nema odgovora na ovu prijavu." },
  teamPrefix: { en: "team:", sr: "tim:" },

  // Member view
  myAppsTitle: { en: "My applications", sr: "Moje prijave" },
  myAppsEmpty: {
    en: "You haven't applied to any hackathons yet.",
    sr: "Još se nisi prijavio ni na jedan hackathon.",
  },
  browseHackathons: { en: "Browse hackathons", sr: "Pregledaj hackathone" },
  appliedOn: { en: "Applied", sr: "Prijavljen" },
  rejReasonLabel: { en: "Reason:", sr: "Razlog:" },

  // Form builder
  fbHeading: { en: "Application form", sr: "Forma za prijavu" },
  fbSub: {
    en: "Questions applicants answer when applying to this hackathon.",
    sr: "Pitanja koja kandidati odgovaraju pri prijavi na ovaj hackathon.",
  },
  fbLoading: { en: "Loading questions…", sr: "Učitavanje pitanja…" },
  fbEmpty: {
    en: "No questions yet. Applicants will apply without extra fields.",
    sr: "Još nema pitanja. Kandidati će se prijaviti bez dodatnih polja.",
  },
  fbAddBtn: { en: "Add question", sr: "Dodaj pitanje" },
  fbReqShort: { en: "required", sr: "obavezno" },
  fbOptShort: { en: "optional", sr: "opciono" },
  fbPromptLabel: { en: "Question", sr: "Pitanje" },
  fbPromptPh: { en: "e.g. What's your motivation?", sr: "npr. Koja je tvoja motivacija?" },
  fbTypeLabel: { en: "Type", sr: "Tip" },
  fbTypeShort: { en: "Short text", sr: "Kratak tekst" },
  fbTypeLong: { en: "Long text", sr: "Dug tekst" },
  fbTypeSingle: { en: "Single choice", sr: "Jedan izbor" },
  fbTypeMulti: { en: "Multiple choice", sr: "Više izbora" },
  fbRequiredLabel: { en: "Required", sr: "Obavezno" },
  fbOptionsLabel: { en: "Options", sr: "Opcije" },
  fbOptionPh: { en: "Option", sr: "Opcija" },
  fbAddOption: { en: "Add option", sr: "Dodaj opciju" },
  fbRemoveOption: { en: "Remove option", sr: "Ukloni opciju" },
  fbSave: { en: "Save", sr: "Sačuvaj" },
  fbSaving: { en: "Saving…", sr: "Čuvanje…" },
  fbCancel: { en: "Cancel", sr: "Otkaži" },
  fbEdit: { en: "Edit", sr: "Izmeni" },
  fbDelete: { en: "Delete", sr: "Obriši" },
  fbDeleting: { en: "Deleting…", sr: "Brisanje…" },
  fbConfirmDelete: { en: "Confirm delete", sr: "Potvrdi brisanje" },
  fbDeleteWarn: {
    en: "Submitted answers to this question will be permanently deleted.",
    sr: "Predati odgovori na ovo pitanje će biti trajno obrisani.",
  },
  fbErrNoPrompt: { en: "Enter a question prompt.", sr: "Unesi tekst pitanja." },
  fbErrNoOptions: {
    en: "Choice questions need at least one option.",
    sr: "Pitanja sa izborom moraju imati bar jednu opciju.",
  },
  fbErrGeneric: {
    en: "Couldn't save the question. Try again.",
    sr: "Nije moguće sačuvati pitanje. Pokušaj ponovo.",
  },
  fbErrDelete: {
    en: "Couldn't delete the question. Try again.",
    sr: "Nije moguće obrisati pitanje. Pokušaj ponovo.",
  },
  fbToastAdded: { en: "Question added", sr: "Pitanje dodato" },
  fbToastUpdated: { en: "Question updated", sr: "Pitanje izmenjeno" },
  fbToastDeleted: { en: "Question deleted", sr: "Pitanje obrisano" },
} as const;

type AppCard = Candidate & {
  /** Skill substrings the card matched against — feeds the free-text search. */
  skillsRaw: string;
  /** GitHub-verified skill count — drives the list card's GitHub badge. */
  githubVerifiedSkillCount: number;
};

/** Pick a deterministic avatar palette class from a stable string. */
const AV_CLASSES = ["av-v", "av-l", "av-t", "av-r"] as const;
function avClassFor(seed: string): string {
  return AV_CLASSES[hashString(seed) % AV_CLASSES.length];
}

/** Cyclic skill-tag colour classes — purely decorative variety. */
const SKILL_TAG_CLASSES = ["sk-v", "sk-l", "sk-t"] as const;

/** Normalise the backend's application status string to the UI's enum. */
function toCandidateStatus(raw: string): CandidateStatus {
  const s = raw.toLowerCase();
  if (s === "approved" || s === "accepted") return "approved";
  if (s === "rejected" || s === "declined") return "rejected";
  return "pending"; // pending / waitlisted / anything else
}

/**
 * Map a backend {@link Applicant} onto the {@link AppCard} the UI renders.
 * Repo/contribution counts have no backing API (they'd require a live
 * GitHub call per applicant), so `ghContrib`/`ghRepos`/`ghLang` stay
 * omitted — but tagged skills and their GitHub-verified status do (D07).
 */
function applicantToCard(a: Applicant, locale: Locale): AppCard {
  const seed = a.username || a.userId;
  const skillNames = a.skills.map((s) => s.name);
  return {
    id: a.applicationId,
    status: toCandidateStatus(a.status),
    name: a.username,
    username: a.username,
    av: initials(a.username),
    avClass: avClassFor(seed),
    time: relTime(a.createdAt, locale),
    desc: a.bio ?? "",
    skillsList: skillNames,
    skillsClasses: skillNames.map((_, i) => SKILL_TAG_CLASSES[i % SKILL_TAG_CLASSES.length]),
    verifiedSkills: a.skills.filter((s) => s.verified).map((s) => s.name),
    skillsRaw: skillNames.join(" "),
    githubVerifiedSkillCount: a.githubVerifiedSkillCount,
    ghContrib: "—",
    ghRepos: "—",
    ghLang: "—",
    team: a.teamName ?? undefined,
  };
}

type TabKey = "pending" | "approved" | "rejected" | "all";
type OrgView = "applicants" | "form";
type Toast = { msg: string; type: "green" | "red" } | null;
type QuestionType = ApplicationQuestion["type"];

const CHOICE_TYPES = new Set<QuestionType>(["single_choice", "multi_choice"]);

export function ApplicationsClient() {
  const { user } = useRequireAuth();
  const t = useT(M);
  const { locale } = useLanguage();

  const isOrganizer = !!user && (user.roles.isOrganization || user.roles.isAdmin);

  // toast (shared by both views)
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, type: "green" | "red") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <>
      {isOrganizer ? (
        <OrganizerSurface
          userId={user!.userId}
          isAdmin={user!.roles.isAdmin}
          locale={locale}
          t={t}
          showToast={showToast}
        />
      ) : (
        <MemberSurface locale={locale} t={t} />
      )}

      {/* toast */}
      <div
        className={toast ? `toast t-${toast.type} show` : "toast"}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {toast?.msg}
      </div>
    </>
  );
}

/*
 * MEMBER SURFACE — the signed-in member's own applications (read-only).
 * */
function MemberSurface({ locale, t }: { locale: Locale; t: (k: keyof typeof M) => string }) {
  const [apps, setApps] = useState<Application[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyApplications()
      .then((list) => {
        if (!cancelled) setApps(list);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pillClass = (status: CandidateStatus) =>
    status === "approved"
      ? "status-pill s-approved"
      : status === "rejected"
        ? "status-pill s-rejected"
        : "status-pill s-pending";
  const PILL_LABEL: Record<CandidateStatus, string> = {
    pending: t("pillPending"),
    approved: t("pillApproved"),
    rejected: t("pillRejected"),
  };

  return (
    <main id="apps">
      <div className="page-head">
        <Link className="col-back" href="/hackathons" aria-label={t("backLabel")}>
          <Icon name="arrow-left" />
        </Link>
        <div className="col-titles">
          <h1 className="page-title">
            <Icon name="hackathon" /> {t("myAppsTitle")}
          </h1>
          <p className="page-sub">{t("pageSubMember")}</p>
        </div>
      </div>

      <div className="apps-list">
        {apps === null &&
          [0, 1, 2].map((i) => (
            <div className="app-card" key={`skel-${i}`} aria-busy="true">
              <div className="app-header" aria-hidden="true">
                <div className="app-meta">
                  <span className="skel skel-line" style={{ width: "55%" }} />
                  <span className="skel skel-line" style={{ width: "35%", marginTop: 7 }} />
                </div>
                <span className="skel" style={{ width: 76, height: 24, borderRadius: 999 }} />
              </div>
            </div>
          ))}

        {apps !== null && apps.length === 0 && (
          <div className="apps-empty">
            <p className="page-sub">{t("myAppsEmpty")}</p>
            <Link className="btn btn-violet" href="/hackathons">
              <Icon name="hackathon" /> {t("browseHackathons")}
            </Link>
          </div>
        )}

        {apps?.map((a) => {
          const status = toCandidateStatus(a.status);
          return (
            <div
              key={a.applicationId}
              className={`app-card${status === "approved" ? " is-approved" : status === "rejected" ? " is-rejected" : ""}`}
            >
              <div className="app-header" style={{ cursor: "default" }}>
                <div className="app-meta">
                  <Link href={`/hackathons/${a.hackathonId}`} className="app-name">
                    {a.hackathonTitle}
                  </Link>
                  <div className="app-sub">
                    {a.teamName ? (
                      <>
                        {t("teamPrefix")}{" "}
                        <strong style={{ color: "var(--violet-light)" }}>{a.teamName}</strong>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {t("appliedOn")} {relTime(a.createdAt, locale)}
                  </div>
                </div>
                <span className={pillClass(status)}>{PILL_LABEL[status]}</span>
              </div>
              {status === "rejected" && a.rejectionReason ? (
                <div className="app-answers" style={{ padding: "0 16px 14px" }}>
                  <div className="reject-reason-box">
                    <strong style={{ color: "var(--red)" }}>{t("rejReasonLabel")}</strong>{" "}
                    {a.rejectionReason}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}

/*
 * ORGANIZER SURFACE — hackathon picker + Applicants / Form-builder tabs.
 * */
function OrganizerSurface({
  userId,
  isAdmin,
  locale,
  t,
  showToast,
}: {
  userId: string;
  isAdmin: boolean;
  locale: Locale;
  t: (k: keyof typeof M) => string;
  showToast: (msg: string, type: "green" | "red") => void;
}) {
  const [hackathons, setHackathons] = useState<HackathonSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<OrgView>("applicants");

  // Load the hackathons this account may manage (own, or all for admins).
  useEffect(() => {
    let cancelled = false;
    api
      .getHackathons()
      .then((all) => {
        if (cancelled) return;
        const mine = isAdmin ? all : all.filter((h) => h.organizationId === userId);
        setHackathons(mine);
        setSelectedId((cur) => cur ?? mine[0]?.hackathonId ?? null);
      })
      .catch(() => {
        if (!cancelled) setHackathons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isAdmin]);

  const selected = useMemo(
    () => hackathons?.find((h) => h.hackathonId === selectedId) ?? null,
    [hackathons, selectedId],
  );

  return (
    <>
      <main id="apps">
        <div className="page-head">
          <Link className="col-back" href="/hackathons/manage" aria-label={t("backLabel")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="hackathon" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        {hackathons === null ? (
          <div className="hack-card" aria-busy="true">
            <div className="hack-banner">
              <span className="skel skel-line" style={{ width: 240, height: 22 }} />
            </div>
          </div>
        ) : hackathons.length === 0 ? (
          <div className="apps-empty">
            <p className="page-sub">{t("noHackathons")}</p>
            <Link className="btn btn-violet" href="/hackathons/new">
              <Icon name="plus" /> {t("noHackathonsCta")}
            </Link>
          </div>
        ) : (
          <>
            {/* Hackathon picker + view switch */}
            <div className="apps-picker">
              <label className="apps-picker-field">
                <span className="apps-picker-label">{t("pickLabel")}</span>
                <select
                  className="apps-select"
                  aria-label={t("pickAria")}
                  value={selectedId ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {hackathons.map((h) => (
                    <option key={h.hackathonId} value={h.hackathonId}>
                      {h.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="apps-view-switch" role="tablist" aria-label={t("pickLabel")}>
                <button
                  role="tab"
                  aria-selected={view === "applicants"}
                  className={view === "applicants" ? "apps-view-btn active" : "apps-view-btn"}
                  onClick={() => setView("applicants")}
                >
                  <Icon name="list" /> {t("viewApplicants")}
                </button>
                <button
                  role="tab"
                  aria-selected={view === "form"}
                  className={view === "form" ? "apps-view-btn active" : "apps-view-btn"}
                  onClick={() => setView("form")}
                >
                  <Icon name="settings" /> {t("viewForm")}
                </button>
              </div>
            </div>

            {selected && view === "applicants" && (
              <ApplicantsReview
                key={`rev-${selected.hackathonId}`}
                hackathonId={selected.hackathonId}
                locale={locale}
                t={t}
                showToast={showToast}
              />
            )}
            {selected && view === "form" && (
              <FormBuilder
                key={`fb-${selected.hackathonId}`}
                hackathonId={selected.hackathonId}
                t={t}
                showToast={showToast}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

/*
 * APPLICANTS REVIEW — stats, capacity, status tabs, cards, popup, reject.
 * */
function ApplicantsReview({
  hackathonId,
  locale,
  t,
  showToast,
}: {
  hackathonId: string;
  locale: Locale;
  t: (k: keyof typeof M) => string;
  showToast: (msg: string, type: "green" | "red") => void;
}) {
  const [cards, setCards] = useState<AppCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [searchQ, setSearchQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openAnswers, setOpenAnswers] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, ApplicationAnswer[] | null>>({});
  const [rejectOpen, setRejectOpen] = useState(false);

  // Skill/GitHub filter + sort — resolved server-side (ApplicationsService.listForHackathon).
  const [skillInput, setSkillInput] = useState("");
  const [skillFilters, setSkillFilters] = useState<string[]>([]);
  const [githubFilter, setGithubFilter] = useState<"" | "true" | "false">("");
  const [sortBy, setSortBy] = useState<ApplicantSortBy>("recent");

  // Debounce the free-text skill input into the committed filter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSkillFilters(
        skillInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [skillInput]);

  /* Lazily load an applicant's answers to the hackathon's custom questions. */
  const toggleAnswers = (id: string) => {
    setOpenAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);
      if (answers[id] === undefined) {
        setAnswers((a) => ({ ...a, [id]: null }));
        api
          .getApplicationAnswers(id)
          .then((list) => setAnswers((a) => ({ ...a, [id]: list })))
          .catch(() => setAnswers((a) => ({ ...a, [id]: [] })));
      }
      return next;
    });
  };

  /* Load applicants + stats for the selected hackathon, re-run whenever the
     skill/GitHub filter or sort changes (server-side, see item 16). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [applicants, appStats] = await Promise.all([
          api.getHackathonApplicants(hackathonId, {
            skills: skillFilters.length ? skillFilters : undefined,
            githubVerified: githubFilter === "" ? undefined : githubFilter === "true",
            sortBy,
          }),
          api.getApplicationStats(hackathonId).catch(() => null),
        ]);
        if (cancelled) return;
        setStats(appStats);
        setCards(applicants.map((a) => applicantToCard(a, locale)));
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load applicants", err);
          setCards([]);
          setStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hackathonId, locale, skillFilters, githubFilter, sortBy]);

  /* counts — derived live from the cards (optimistic updates stay in sync). */
  const ap = cards.filter((c) => c.status === "approved").length;
  const rj = cards.filter((c) => c.status === "rejected").length;
  const pe = cards.filter((c) => c.status === "pending").length;
  const total = stats ? stats.total : ap + rj + pe;
  const capMax = stats?.maxParticipants ?? null;
  const capPct = capMax && capMax > 0 ? Math.round((ap / capMax) * 100) : 0;

  const PILL_LABEL: Record<CandidateStatus, string> = {
    pending: t("pillPending"),
    approved: t("pillApproved"),
    rejected: t("pillRejected"),
  };

  /* lock body scroll while a popup is open */
  useEffect(() => {
    const anyOpen = openId !== null || rejectOpen;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [openId, rejectOpen]);

  const openCard = cards.find((c) => c.id === openId) ?? null;

  /* Esc closes the topmost layer */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (rejectOpen) setRejectOpen(false);
      else if (openId !== null) setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rejectOpen, openId]);

  /* filtering — tab + text search */
  const isHidden = (card: AppCard) => {
    const tabOk = activeTab === "all" || card.status === activeTab;
    const q = searchQ.trim().toLowerCase();
    const searchOk =
      !q ||
      card.name.toLowerCase().includes(q) ||
      card.username.toLowerCase().includes(q) ||
      (card.team ?? "").toLowerCase().includes(q) ||
      card.skillsRaw.toLowerCase().includes(q);
    return !(tabOk && searchOk);
  };

  const showApproveAll = activeTab === "pending" || activeTab === "all";

  const setStatus = (id: string, status: CandidateStatus, patch: Partial<AppCard> = {}) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status, ...patch } : c)));

  const snapshot = (id: string): AppCard | undefined => cards.find((c) => c.id === id);

  const applyApprove = (id: string) => {
    const prev = snapshot(id);
    setStatus(id, "approved", { actionHint: t("hintApproved") });
    showToast(t("toastApproved"), "green");
    api.approveApplication(id).catch((err) => {
      console.error("approveApplication failed", err);
      if (prev) setStatus(id, prev.status, prev);
      showToast(t("toastActionFailed"), "red");
    });
  };

  const applyReject = (id: string, reason: string) => {
    const prev = snapshot(id);
    const patch: Partial<AppCard> = { actionHint: t("hintRejected") };
    if (reason) patch.rejectReason = reason;
    setStatus(id, "rejected", patch);
    showToast(t("toastRejected"), "red");
    api.rejectApplication(id, reason || undefined).catch((err) => {
      console.error("rejectApplication failed", err);
      if (prev) setStatus(id, prev.status, prev);
      showToast(t("toastActionFailed"), "red");
    });
  };

  const confirmReject = (reason: string) => {
    setRejectOpen(false);
    if (openId) applyReject(openId, reason);
  };

  const approveAllPending = () => {
    if (pe === 0) {
      showToast(t("toastNoPending"), "red");
      return;
    }
    const pendingIds = cards.filter((c) => c.status === "pending").map((c) => c.id);
    setCards((prev) =>
      prev.map((c) =>
        c.status === "pending" ? { ...c, status: "approved", actionHint: t("hintApproved") } : c,
      ),
    );
    showToast(t("toastAllApproved"), "green");
    void Promise.allSettled(pendingIds.map((id) => api.approveApplication(id))).then((results) => {
      let anyFailed = false;
      results.forEach((res, i) => {
        if (res.status === "rejected") {
          anyFailed = true;
          console.error("approveApplication failed", pendingIds[i], res.reason);
          setStatus(pendingIds[i], "pending", { actionHint: undefined });
        }
      });
      if (anyFailed) showToast(t("toastActionFailed"), "red");
    });
  };

  const onCardKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenId(id);
    }
  };
  const onRowKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

  const cardClass = (c: AppCard) =>
    [
      "app-card",
      c.status === "approved" && "is-approved",
      c.status === "rejected" && "is-rejected",
      isHidden(c) && "is-hidden",
    ]
      .filter(Boolean)
      .join(" ");

  const pillClass = (status: CandidateStatus) =>
    status === "approved"
      ? "status-pill s-approved"
      : status === "rejected"
        ? "status-pill s-rejected"
        : "status-pill s-pending";

  return (
    <>
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">{t("statTotal")}</div>
          <div className="stat-val v-violet">{total}</div>
        </div>
        <div className="stat-card stat-card-focus">
          <div className="stat-label">{t("statPending")}</div>
          <div className="stat-val v-lemon">{pe}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("statApproved")}</div>
          <div className="stat-val v-green">{ap}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("statRejected")}</div>
          <div className="stat-val v-red">{rj}</div>
        </div>
      </div>

      {/* Capacity only renders when the hackathon actually has a cap. */}
      {capMax && capMax > 0 ? (
        <div className="capacity-wrap">
          <div className="cap-head">
            <span className="cap-label">{t("capLabel")}</span>
            <span className="cap-count">
              <span>{ap}</span> / {capMax} {t("capSpots")}
            </span>
          </div>
          <div className="cap-bar-bg">
            <div className="cap-bar-fill" style={{ width: `${capPct}%` }} />
          </div>
        </div>
      ) : null}

      <div className="app-tabs" role="tablist" aria-label={t("tabFilterLabel")}>
        {(["pending", "approved", "rejected", "all"] as TabKey[]).map((tab) => {
          const badge =
            tab === "pending" ? pe : tab === "approved" ? ap : tab === "rejected" ? rj : null;
          const badgeClass =
            tab === "pending"
              ? "pending-badge"
              : tab === "approved"
                ? "approved-badge"
                : "rejected-badge";
          const label =
            tab === "pending"
              ? t("tabPending")
              : tab === "approved"
                ? t("tabApproved")
                : tab === "rejected"
                  ? t("tabRejected")
                  : t("tabAll");
          return (
            <button
              key={tab}
              className={activeTab === tab ? "app-tab active" : "app-tab"}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {label}
              {badge !== null && <span className={`app-tab-badge ${badgeClass}`}>{badge}</span>}
            </button>
          );
        })}
        {showApproveAll && (
          <button className="approve-all-tab-btn" onClick={approveAllPending}>
            <Icon name="check" /> {t("approveAllBtn")}
          </button>
        )}
      </div>

      {/* Skill / GitHub filter + sort — resolved server-side */}
      <div className="apps-filter-row">
        <div className="search" role="search">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t("filterSkillsLabel")}
            placeholder={t("filterSkillsPh")}
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
          />
        </div>
        <label className="apps-picker-field">
          <span className="apps-picker-label">{t("filterGithubLabel")}</span>
          <select
            className="apps-select"
            value={githubFilter}
            onChange={(e) => setGithubFilter(e.target.value as "" | "true" | "false")}
          >
            <option value="">{t("filterGithubAll")}</option>
            <option value="true">{t("filterGithubVerified")}</option>
            <option value="false">{t("filterGithubUnverified")}</option>
          </select>
        </label>
        <label className="apps-picker-field">
          <span className="apps-picker-label">{t("sortLabel")}</span>
          <select
            className="apps-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ApplicantSortBy)}
          >
            <option value="recent">{t("sortRecent")}</option>
            <option value="skills">{t("sortSkills")}</option>
            <option value="github">{t("sortGithub")}</option>
          </select>
        </label>
      </div>

      {/* Search */}
      <div className="apps-search-row">
        <div className="search" role="search">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t("searchLabel")}
            placeholder={t("searchPh")}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
      </div>

      <div className="apps-list">
        {loading &&
          [0, 1, 2, 3].map((i) => (
            <div className="app-card" key={`skel-${i}`} aria-busy="true">
              <div className="app-header" aria-hidden="true">
                <span
                  className="app-avatar is-orb skel skel-circle"
                  style={{ width: 44, height: 44 }}
                />
                <div className="app-meta">
                  <span className="skel skel-line" style={{ width: "60%" }} />
                  <span className="skel skel-line" style={{ width: "40%", marginTop: 7 }} />
                </div>
                <span className="skel" style={{ width: 76, height: 24, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        {!loading && cards.length === 0 && <p className="page-sub">{t("emptyApps")}</p>}
        {!loading &&
          cards.map((c) => (
            <div key={c.id} className={cardClass(c)} data-status={c.status}>
              <div
                className="app-header"
                role="button"
                tabIndex={0}
                aria-label={`${t("openCardAria")}: ${c.name}`}
                onClick={() => setOpenId(c.id)}
                onKeyDown={(e) => onCardKey(e, c.id)}
              >
                <div className={`app-avatar ${c.avClass} is-orb`}>
                  <GenerativeAvatar seed={toSeed(c.username)} className="orb-art" />
                </div>
                <div className="app-meta">
                  <div className="app-name">{c.name}</div>
                  <div className="app-sub">
                    @{c.username}
                    {c.team ? (
                      <>
                        {" "}
                        · {t("teamPrefix")}{" "}
                        <strong style={{ color: "var(--violet-light)" }}>{c.team}</strong> ·{" "}
                        {c.time}
                      </>
                    ) : (
                      <> · {c.time}</>
                    )}
                  </div>
                </div>
                {c.githubVerifiedSkillCount > 0 && (
                  <span className="badge badge-open" title={t("githubBadgeTitle")}>
                    <Icon name="check" className="ic-sm" /> {c.githubVerifiedSkillCount}
                  </span>
                )}
                <span className={pillClass(c.status)}>{PILL_LABEL[c.status]}</span>
                <span className="chevron" aria-hidden="true">
                  <Icon name="chevron-down" />
                </span>
              </div>

              <button
                className="btn btn-ghost"
                style={{ margin: "0 14px 10px" }}
                onClick={() => toggleAnswers(c.id)}
              >
                {openAnswers.has(c.id) ? t("hideAnswers") : t("showAnswers")}
              </button>

              {openAnswers.has(c.id) && (
                <div
                  className="app-answers"
                  style={{ padding: "0 14px 14px", display: "grid", gap: 10 }}
                >
                  {answers[c.id] === null && <p className="app-sub">{t("answersLoading")}</p>}
                  {answers[c.id] != null && answers[c.id]!.length === 0 && (
                    <p className="app-sub">{t("answersEmpty")}</p>
                  )}
                  {answers[c.id]?.map((ans) => (
                    <div key={ans.questionId}>
                      <div className="app-sub" style={{ fontWeight: 600, color: "var(--text)" }}>
                        {ans.prompt}
                      </div>
                      <div className="app-sub">{ans.answer || "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Right rail — only the one real action exists (approve all). */}
      <aside className="rail-right" aria-label={t("quickActionsTitle")}>
        <div className="social-card">
          <div className="social-card-header">
            <div className="social-card-title">{t("quickActionsTitle")}</div>
          </div>
          <div className="preview-list">
            <div
              className="preview-row"
              role="button"
              tabIndex={0}
              aria-label={t("approveAllPending")}
              onClick={approveAllPending}
              onKeyDown={(e) => onRowKey(e, approveAllPending)}
            >
              <div className="pr-dot dot-green" />
              <div className="pr-info">
                <div className="pr-name">{t("approveAllPending")}</div>
                <div className="pr-sub">
                  {pe} {t("pendingCountHint")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="mini">
          <span>{t("aboutUs")}</span> · <span>{t("accessibility")}</span> ·{" "}
          <span>{t("privacy")}</span>
          <br />
          <span className="cw">
            <b>tiki</b>miki
          </span>{" "}
          © 2026
        </footer>
      </aside>

      {/* Candidate popup */}
      {openCard && (
        <CandidatePopup
          candidate={openCard}
          onClose={() => setOpenId(null)}
          onApprove={() => applyApprove(openCard.id)}
          onReject={() => setRejectOpen(true)}
        />
      )}

      {/* Reject modal */}
      {rejectOpen && openCard && (
        <RejectModal
          username={openCard.username}
          onCancel={() => setRejectOpen(false)}
          onConfirm={confirmReject}
        />
      )}
    </>
  );
}

/*
 * FORM BUILDER — manage the hackathon's application questions.
 * */

type DraftState = {
  prompt: string;
  type: QuestionType;
  required: boolean;
  options: string[];
};

const BLANK_DRAFT: DraftState = {
  prompt: "",
  type: "short_text",
  required: false,
  options: [],
};

function FormBuilder({
  hackathonId,
  t,
  showToast,
}: {
  hackathonId: string;
  t: (k: keyof typeof M) => string;
  showToast: (msg: string, type: "green" | "red") => void;
}) {
  const [questions, setQuestions] = useState<ApplicationQuestion[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // delete-in-flight

  useEffect(() => {
    let cancelled = false;
    api
      .getApplicationQuestions(hackathonId)
      .then((list) => {
        if (!cancelled) setQuestions([...list].sort((a, b) => a.position - b.position));
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  const nextPosition = () =>
    questions && questions.length ? Math.max(...questions.map((q) => q.position)) + 1 : 0;

  const handleCreate = async (draft: DraftState): Promise<boolean> => {
    try {
      const created = await api.createApplicationQuestion(hackathonId, {
        prompt: draft.prompt.trim(),
        type: draft.type,
        required: draft.required,
        position: nextPosition(),
        ...(CHOICE_TYPES.has(draft.type) ? { options: draft.options } : {}),
      });
      setQuestions((prev) => [...(prev ?? []), created].sort((a, b) => a.position - b.position));
      setAdding(false);
      showToast(t("fbToastAdded"), "green");
      return true;
    } catch (err) {
      console.error("createApplicationQuestion failed", err);
      return false;
    }
  };

  /** PATCH only the fields that changed from the stored question. */
  const handleUpdate = async (
    original: ApplicationQuestion,
    draft: DraftState,
  ): Promise<boolean> => {
    const patch: Parameters<typeof api.updateApplicationQuestion>[1] = {};
    const trimmed = draft.prompt.trim();
    if (trimmed !== original.prompt) patch.prompt = trimmed;
    if (draft.type !== original.type) patch.type = draft.type;
    if (draft.required !== original.required) patch.required = draft.required;

    if (CHOICE_TYPES.has(draft.type)) {
      const origOpts = original.options ?? [];
      const changed =
        draft.options.length !== origOpts.length || draft.options.some((o, i) => o !== origOpts[i]);
      // Always send options when converting TO a choice type (backend 400s
      // otherwise), or when they actually changed.
      if (!CHOICE_TYPES.has(original.type) || changed) {
        patch.options = draft.options;
      }
    }

    if (Object.keys(patch).length === 0) {
      // Nothing to do — close the editor without a network round-trip.
      setEditingId(null);
      return true;
    }

    try {
      const updated = await api.updateApplicationQuestion(original.questionId, patch);
      setQuestions((prev) =>
        (prev ?? [])
          .map((q) => (q.questionId === updated.questionId ? updated : q))
          .sort((a, b) => a.position - b.position),
      );
      setEditingId(null);
      showToast(t("fbToastUpdated"), "green");
      return true;
    } catch (err) {
      console.error("updateApplicationQuestion failed", err);
      return false;
    }
  };

  const handleDelete = async (questionId: string) => {
    setBusyId(questionId);
    try {
      await api.deleteApplicationQuestion(questionId);
      setQuestions((prev) => (prev ?? []).filter((q) => q.questionId !== questionId));
      setConfirmDeleteId(null);
      showToast(t("fbToastDeleted"), "green");
    } catch (err) {
      console.error("deleteApplicationQuestion failed", err);
      showToast(t("fbErrDelete"), "red");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="fb">
      <div className="fb-head">
        <div>
          <h2 className="fb-title">{t("fbHeading")}</h2>
          <p className="page-sub">{t("fbSub")}</p>
        </div>
        {!adding && (
          <button
            className="btn btn-violet"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            <Icon name="plus" /> {t("fbAddBtn")}
          </button>
        )}
      </div>

      {adding && (
        <QuestionEditor
          initial={BLANK_DRAFT}
          t={t}
          onCancel={() => setAdding(false)}
          onSave={handleCreate}
        />
      )}

      {questions === null && (
        <div className="fb-list">
          {[0, 1].map((i) => (
            <div className="fb-card" key={`skel-${i}`} aria-busy="true">
              <span className="skel skel-line" style={{ width: "55%" }} />
              <span className="skel skel-line" style={{ width: "30%", marginTop: 9 }} />
            </div>
          ))}
        </div>
      )}

      {questions !== null && questions.length === 0 && !adding && (
        <p className="fb-empty">{t("fbEmpty")}</p>
      )}

      {questions !== null && questions.length > 0 && (
        <ol className="fb-list">
          {questions.map((q, i) =>
            editingId === q.questionId ? (
              <li key={q.questionId}>
                <QuestionEditor
                  initial={{
                    prompt: q.prompt,
                    type: q.type,
                    required: q.required,
                    options: q.options ?? [],
                  }}
                  t={t}
                  onCancel={() => setEditingId(null)}
                  onSave={(draft) => handleUpdate(q, draft)}
                />
              </li>
            ) : (
              <li key={q.questionId} className="fb-card">
                <div className="fb-card-main">
                  <span className="fb-pos">{i + 1}</span>
                  <div className="fb-card-body">
                    <div className="fb-prompt">{q.prompt}</div>
                    <div className="fb-meta">
                      <span className="fb-type-tag">{typeLabel(q.type, t)}</span>
                      <span className={q.required ? "fb-req-tag is-on" : "fb-req-tag"}>
                        {q.required ? t("fbReqShort") : t("fbOptShort")}
                      </span>
                    </div>
                    {q.options && q.options.length > 0 && (
                      <div className="fb-opts">
                        {q.options.map((o, oi) => (
                          <span key={oi} className="fb-opt-chip">
                            {o}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="fb-card-actions">
                    <button
                      className="fb-icon-btn"
                      aria-label={t("fbEdit")}
                      onClick={() => {
                        setEditingId(q.questionId);
                        setAdding(false);
                        setConfirmDeleteId(null);
                      }}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      className="fb-icon-btn fb-icon-danger"
                      aria-label={t("fbDelete")}
                      onClick={() =>
                        setConfirmDeleteId((cur) => (cur === q.questionId ? null : q.questionId))
                      }
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>

                {confirmDeleteId === q.questionId && (
                  <div className="fb-confirm" role="alertdialog">
                    <p className="fb-confirm-warn">
                      <Icon name="flag" /> {t("fbDeleteWarn")}
                    </p>
                    <div className="fb-confirm-actions">
                      <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>
                        {t("fbCancel")}
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busyId === q.questionId}
                        onClick={() => handleDelete(q.questionId)}
                      >
                        <Icon name="trash" />{" "}
                        {busyId === q.questionId ? t("fbDeleting") : t("fbConfirmDelete")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}

function typeLabel(type: QuestionType, t: (k: keyof typeof M) => string): string {
  switch (type) {
    case "short_text":
      return t("fbTypeShort");
    case "long_text":
      return t("fbTypeLong");
    case "single_choice":
      return t("fbTypeSingle");
    case "multi_choice":
      return t("fbTypeMulti");
  }
}

/** Inline add/edit editor — used for both new and existing questions. */
function QuestionEditor({
  initial,
  t,
  onCancel,
  onSave,
}: {
  initial: DraftState;
  t: (k: keyof typeof M) => string;
  onCancel: () => void;
  onSave: (draft: DraftState) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState(initial.prompt);
  const [type, setType] = useState<QuestionType>(initial.type);
  const [required, setRequired] = useState(initial.required);
  const [options, setOptions] = useState<string[]>(initial.options.length ? initial.options : [""]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isChoice = CHOICE_TYPES.has(type);

  const setOption = (idx: number, value: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  const addOption = () => setOptions((prev) => [...prev, ""]);
  const removeOption = (idx: number) =>
    setOptions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const save = async () => {
    setError(null);
    if (!prompt.trim()) {
      setError(t("fbErrNoPrompt"));
      return;
    }
    let cleanOptions: string[] = [];
    if (isChoice) {
      cleanOptions = options.map((o) => o.trim()).filter(Boolean);
      if (cleanOptions.length === 0) {
        setError(t("fbErrNoOptions"));
        return;
      }
    }
    setSaving(true);
    const ok = await onSave({
      prompt: prompt.trim(),
      type,
      required,
      options: cleanOptions,
    });
    if (!ok) {
      setSaving(false);
      setError(t("fbErrGeneric"));
    }
    // On success the parent unmounts this editor.
  };

  return (
    <div className="fb-editor">
      <label className="fb-field">
        <span className="fb-label">{t("fbPromptLabel")}</span>
        <input
          className="fb-input"
          value={prompt}
          placeholder={t("fbPromptPh")}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>

      <div className="fb-row">
        <label className="fb-field">
          <span className="fb-label">{t("fbTypeLabel")}</span>
          <select
            className="fb-select"
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            <option value="short_text">{t("fbTypeShort")}</option>
            <option value="long_text">{t("fbTypeLong")}</option>
            <option value="single_choice">{t("fbTypeSingle")}</option>
            <option value="multi_choice">{t("fbTypeMulti")}</option>
          </select>
        </label>

        <label className="fb-toggle">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>{t("fbRequiredLabel")}</span>
        </label>
      </div>

      {isChoice && (
        <div className="fb-field">
          <span className="fb-label">{t("fbOptionsLabel")}</span>
          <div className="fb-options">
            {options.map((opt, idx) => (
              <div className="fb-option-row" key={idx}>
                <input
                  className="fb-input"
                  value={opt}
                  placeholder={`${t("fbOptionPh")} ${idx + 1}`}
                  onChange={(e) => setOption(idx, e.target.value)}
                />
                <button
                  type="button"
                  className="fb-icon-btn fb-icon-danger"
                  aria-label={t("fbRemoveOption")}
                  disabled={options.length <= 1}
                  onClick={() => removeOption(idx)}
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="fb-add-opt" onClick={addOption}>
            <Icon name="plus" /> {t("fbAddOption")}
          </button>
        </div>
      )}

      {error && <p className="fb-err">{error}</p>}

      <div className="fb-editor-foot">
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          {t("fbCancel")}
        </button>
        <button className="btn btn-violet" onClick={save} disabled={saving}>
          <Icon name="check" /> {saving ? t("fbSaving") : t("fbSave")}
        </button>
      </div>
    </div>
  );
}

export default ApplicationsClient;
