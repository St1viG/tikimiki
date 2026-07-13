"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HackathonType } from "@tikimiki/types";
import { HACKATHON_TYPE } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ApiError,
  createHackathon,
  createHackathonDraft,
  deleteApplicationQuestion,
  deleteHackathonDraft,
  getApplicationQuestions,
  getHackathon,
  getHackathonDraft,
  getHackathonDrafts,
  resubmitOrgVerification,
  createApplicationQuestion,
  updateApplicationQuestion,
  updateHackathon,
  updateHackathonDraft,
  uploadGroupIcon,
  type ApplicationQuestion,
  type HackathonDraft,
  type PublishQuestion,
} from "@/lib/api";
import {
  QuestionBuilder,
  newQuestion,
  type QuestionDraft,
} from "@/components/hackathons/QuestionBuilder";

/**
 * NewHackathonClient — the create-a-hackathon form (route "/hackathons/new").
 *
 * Organization accounts only. Visitors who are anonymous or not an organization
 * see a clear "organization accounts only" state instead of the form. The form
 * mirrors the backend's POST /hackathons contract and its 400 rules client-side
 * (inline errors), then surfaces any backend ApiError message too. Logo + banner
 * upload through POST /uploads/image (uploadGroupIcon) with a live preview.
 *
 * Supplies its own `<main className="nh-page" id="nh-main">`.
 */

const M = {
  back: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Organize a hackathon", sr: "Organizuj hackathon" },
  pageSub: { en: "Create and publish a new hackathon.", sr: "Kreiraj i objavi novi hackathon." },

  // Gate (non-organization)
  gateTitle: { en: "Organization accounts only", sr: "Samo za organizacijske naloge" },
  gateBody: {
    en: "Only verified organization accounts can create hackathons. Sign in with an organization account to organize one.",
    sr: "Samo verifikovani organizacijski nalozi mogu kreirati hackathone. Prijavi se kao organizacija da bi organizovao.",
  },
  gateBodyAnon: {
    en: "Only organization accounts can create hackathons. Sign in to continue.",
    sr: "Samo organizacijski nalozi mogu kreirati hackathone. Prijavi se da nastaviš.",
  },
  gateLogin: { en: "Sign in", sr: "Prijava" },
  gateBrowse: { en: "Browse hackathons", sr: "Pregledaj hackathone" },
  gatePendingTitle: { en: "Verification pending", sr: "Verifikacija na čekanju" },
  gatePendingBody: {
    en: "Your organization is awaiting administrator approval. You will be able to create hackathons once it is verified.",
    sr: "Tvoja organizacija čeka odobrenje administratora. Kreiranje hackathona biće dostupno čim verifikacija bude odobrena.",
  },
  gateRejectedTitle: { en: "Verification rejected", sr: "Verifikacija odbijena" },
  gateRejectedBody: {
    en: "Your organization's verification request was rejected.",
    sr: "Zahtev za verifikaciju tvoje organizacije je odbijen.",
  },
  gateReasonLabel: { en: "Reason", sr: "Razlog" },
  gateResubmit: { en: "Resubmit request", sr: "Podnesi zahtev ponovo" },
  gateResubmitting: { en: "Submitting…", sr: "Slanje…" },
  gateResubmitted: {
    en: "Request resubmitted — awaiting administrator approval.",
    sr: "Zahtev je ponovo podnet — čeka odobrenje administratora.",
  },
  gateResubmitError: {
    en: "Could not resubmit the request. Try again.",
    sr: "Ponovno podnošenje nije uspelo. Pokušaj ponovo.",
  },

  // Sections
  secBasics: { en: "Basics", sr: "Osnovno" },
  secSchedule: { en: "Schedule", sr: "Raspored" },
  secFormat: { en: "Format & location", sr: "Format i lokacija" },
  secTeams: { en: "Teams & capacity", sr: "Timovi i kapacitet" },
  secMedia: { en: "Media", sr: "Mediji" },

  // Fields
  fTitle: { en: "Title", sr: "Naziv" },
  fTitlePh: { en: "e.g. ETF Hackathon 2026", sr: "npr. ETF Hackathon 2026" },
  fDescription: { en: "Description", sr: "Opis" },
  fDescriptionPh: { en: "What is this hackathon about?", sr: "O čemu je ovaj hackathon?" },
  fTheme: { en: "Theme", sr: "Tema" },
  fThemeOpt: { en: "optional", sr: "opciono" },
  fThemePh: { en: "e.g. AI tools for students", sr: "npr. AI alati za studente" },
  fType: { en: "Type", sr: "Tip" },
  typePhysical: { en: "Physical", sr: "Fizički" },
  typeVirtual: { en: "Virtual", sr: "Virtuelni" },
  typeHybrid: { en: "Hybrid", sr: "Hibridni" },
  fStartsAt: { en: "Starts", sr: "Počinje" },
  fEndsAt: { en: "Ends", sr: "Završava se" },
  fRegDeadline: { en: "Registration deadline", sr: "Rok za prijavu" },
  fLocation: { en: "Location", sr: "Lokacija" },
  fLocationPh: { en: "e.g. Belgrade, ETF", sr: "npr. Beograd, ETF" },
  fLatitude: { en: "Latitude", sr: "Geografska širina" },
  fLongitude: { en: "Longitude", sr: "Geografska dužina" },
  fMaxParticipants: { en: "Max participants", sr: "Maks. učesnika" },
  fMaxPartPh: { en: "No limit", sr: "Bez ograničenja" },
  fMinTeamSize: { en: "Min team size", sr: "Min. veličina tima" },
  fMaxTeamSize: { en: "Max team size", sr: "Maks. veličina tima" },
  fLogo: { en: "Logo", sr: "Logo" },
  fBanner: { en: "Banner", sr: "Baner" },
  upload: { en: "Upload image", sr: "Otpremi sliku" },
  uploading: { en: "Uploading…", sr: "Otpremanje…" },
  remove: { en: "Remove", sr: "Ukloni" },
  locationHint: {
    en: "Physical and hybrid hackathons need a location with coordinates.",
    sr: "Fizički i hibridni hackathoni zahtevaju lokaciju sa koordinatama.",
  },

  // Validation
  errTitle: { en: "Add a title.", sr: "Dodaj naziv." },
  errDescription: { en: "Add a description.", sr: "Dodaj opis." },
  errStartsAt: { en: "Set a start date.", sr: "Postavi datum početka." },
  errEndsAt: { en: "Set an end date.", sr: "Postavi datum završetka." },
  errRegDeadline: { en: "Set a registration deadline.", sr: "Postavi rok za prijavu." },
  errEndBeforeStart: {
    en: "End must be after the start.",
    sr: "Završetak mora biti posle početka.",
  },
  errDeadlineAfterStart: {
    en: "The deadline must be before the start.",
    sr: "Rok mora biti pre početka.",
  },
  errMaxParticipants: {
    en: "Max participants must be greater than 0.",
    sr: "Maks. učesnika mora biti veće od 0.",
  },
  errMinTeamSize: {
    en: "Min team size must be at least 1.",
    sr: "Min. veličina tima mora biti bar 1.",
  },
  errMaxTeamSize: {
    en: "Max team size must be at least the min.",
    sr: "Maks. veličina tima mora biti bar koliko i min.",
  },
  errLocation: {
    en: "Location is required for this type.",
    sr: "Lokacija je obavezna za ovaj tip.",
  },
  errLatLng: {
    en: "Latitude and longitude are required for this type.",
    sr: "Širina i dužina su obavezne za ovaj tip.",
  },
  errLatLngPaired: { en: "Set both latitude and longitude.", sr: "Postavi i širinu i dužinu." },
  errLatRange: {
    en: "Latitude must be between -90 and 90.",
    sr: "Širina mora biti između -90 i 90.",
  },
  errLngRange: {
    en: "Longitude must be between -180 and 180.",
    sr: "Dužina mora biti između -180 i 180.",
  },
  uploadFailed: { en: "Couldn't upload the image.", sr: "Otpremanje slike nije uspelo." },

  // Submit
  submit: { en: "Publish hackathon", sr: "Objavi hackathon" },
  submitting: { en: "Publishing…", sr: "Objavljivanje…" },
  cancel: { en: "Cancel", sr: "Otkaži" },

  // Edit mode
  editTitle: { en: "Edit hackathon", sr: "Izmeni hackathon" },
  editSub: {
    en: "Update your hackathon's details and application form.",
    sr: "Ažuriraj detalje hackathona i formular za prijavu.",
  },
  saveChanges: { en: "Save changes", sr: "Sačuvaj izmene" },
  saving: { en: "Saving…", sr: "Čuvanje…" },
  loading: { en: "Loading…", sr: "Učitavanje…" },

  // Draft (server-side)
  draftSaving: { en: "Saving draft…", sr: "Čuvanje nacrta…" },
  draftSaved: { en: "Draft saved", sr: "Nacrt sačuvan" },
  resumeTitle: { en: "Continue where you left off?", sr: "Nastavi gde si stao?" },
  resumeBody: {
    en: "You have an unpublished hackathon draft.",
    sr: "Imaš nezavršen nacrt hackathona.",
  },
  resumeContinue: { en: "Continue draft", sr: "Nastavi nacrt" },
  resumeDiscard: { en: "Discard", sr: "Odbaci" },
} as const;

/** Local form state — kept as strings to mirror the raw inputs. */
interface FormState {
  title: string;
  description: string;
  theme: string;
  type: HackathonType;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  location: string;
  latitude: string;
  longitude: string;
  maxParticipants: string;
  minTeamSize: string;
  maxTeamSize: string;
  logoUrl: string;
  bannerUrl: string;
}

const INITIAL: FormState = {
  title: "",
  description: "",
  theme: "",
  type: "physical",
  startsAt: "",
  endsAt: "",
  registrationDeadline: "",
  location: "",
  latitude: "",
  longitude: "",
  maxParticipants: "",
  minTeamSize: "1",
  maxTeamSize: "4",
  logoUrl: "",
  bannerUrl: "",
};

type Errors = Partial<Record<keyof FormState, string>>;

/** `datetime-local` value (no zone) → ISO-8601 string. Empty stays empty. */
function toIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** ISO-8601 → `datetime-local` value (local wall time, minute precision). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Map builder questions → the publish payload (choice types keep options). */
function toPublishQuestions(questions: QuestionDraft[]): PublishQuestion[] {
  return questions
    .filter((q) => q.prompt.trim() !== "")
    .map((q) => {
      const isChoice = q.type === "single_choice" || q.type === "multi_choice";
      return {
        prompt: q.prompt.trim(),
        type: q.type,
        options: isChoice ? q.options.map((o) => o.trim()).filter(Boolean) : undefined,
        required: q.required,
        allowOther: isChoice ? q.allowOther : false,
      };
    });
}

/** Existing server question → builder draft. */
function fromApiQuestion(q: ApplicationQuestion): QuestionDraft {
  return {
    key: q.questionId,
    questionId: q.questionId,
    prompt: q.prompt,
    type: q.type,
    options: q.options && q.options.length > 0 ? q.options : ["", ""],
    required: q.required,
    allowOther: q.allowOther,
  };
}

export function NewHackathonClient({
  hackathonId,
  resumeDraftId,
}: {
  hackathonId?: string;
  resumeDraftId?: string;
} = {}) {
  const t = useT(M);
  const router = useRouter();
  const { user, status } = useAuth();
  const isEdit = !!hackathonId;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<null | "logo" | "banner">(null);
  const [loadingData, setLoadingData] = useState(isEdit);

  // Server-side draft (create mode only): autosave + resume.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [resumeOffer, setResumeOffer] = useState<HackathonDraft | null>(null);
  // Question ids present at load (edit mode) — to reconcile deletes on save.
  const initialQuestionIds = useRef<string[]>([]);
  // Blocks autosave until the initial load / resume has settled.
  const hydrated = useRef(!isEdit && !resumeDraftId);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const isOrg = !!user?.roles.isOrganization;
  // SSU2: only ADMIN-VERIFIED organizations may create hackathons (the
  // backend enforces the same rule on create and on the draft endpoints).
  const orgStatus = user?.organization?.verificationStatus;
  const isVerifiedOrg = isOrg && orgStatus === "approved";
  const [resubmitState, setResubmitState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const needsLocation = form.type !== "virtual";

  const restore = useCallback((payload: Record<string, unknown>) => {
    const p = payload as {
      form?: Partial<FormState>;
      questions?: QuestionDraft[];
    };
    if (p.form) setForm({ ...INITIAL, ...p.form });
    if (Array.isArray(p.questions)) {
      setQuestions(
        p.questions.map((q, i) => ({
          ...newQuestion(),
          ...q,
          key: q.key ?? `q-restore-${i}`,
        })),
      );
    }
  }, []);

  // Edit mode: load the hackathon + its application questions.
  useEffect(() => {
    if (!isEdit || !hackathonId) return;
    let cancelled = false;
    (async () => {
      try {
        const [h, qs] = await Promise.all([
          getHackathon(hackathonId),
          getApplicationQuestions(hackathonId),
        ]);
        if (cancelled) return;
        setForm({
          title: h.title,
          description: h.description,
          theme: h.theme ?? "",
          type: h.type,
          startsAt: toLocalInput(h.startsAt),
          endsAt: toLocalInput(h.endsAt),
          registrationDeadline: toLocalInput(h.registrationDeadline),
          location: h.location ?? "",
          latitude: h.latitude != null ? String(h.latitude) : "",
          longitude: h.longitude != null ? String(h.longitude) : "",
          maxParticipants: h.maxParticipants != null ? String(h.maxParticipants) : "",
          minTeamSize: String(h.minTeamSize),
          maxTeamSize: String(h.maxTeamSize),
          logoUrl: h.logoUrl ?? "",
          bannerUrl: h.bannerUrl ?? "",
        });
        const drafts = qs.map(fromApiQuestion);
        setQuestions(drafts);
        initialQuestionIds.current = drafts
          .map((q) => q.questionId)
          .filter((id): id is string => !!id);
      } catch (err) {
        if (!cancelled) {
          setServerError(err instanceof Error ? err.message : "Error");
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
          hydrated.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, hackathonId]);

  // Create mode: resume a specific draft (?draft=…) or offer the latest one.
  useEffect(() => {
    if (isEdit || !isVerifiedOrg) return;
    let cancelled = false;
    (async () => {
      try {
        if (resumeDraftId) {
          const d = await getHackathonDraft(resumeDraftId);
          if (cancelled) return;
          restore(d.payload);
          setDraftId(d.draftId);
        } else {
          const drafts = await getHackathonDrafts();
          if (!cancelled && drafts.length > 0) setResumeOffer(drafts[0]);
        }
      } catch {
        /* no draft / unreachable → start fresh */
      } finally {
        if (!cancelled) hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, isVerifiedOrg, resumeDraftId, restore]);

  // Autosave (create mode): debounced create/patch of the server draft. Held
  // back while a resume prompt is pending and until nothing meaningful exists.
  useEffect(() => {
    if (isEdit || !isVerifiedOrg || !hydrated.current || resumeOffer) return;
    const meaningful =
      form.title.trim() !== "" || form.description.trim() !== "" || questions.length > 0;
    if (!meaningful && !draftId) return;

    setDraftStatus("saving");
    const handle = setTimeout(async () => {
      try {
        const payload = { form, questions } as Record<string, unknown>;
        if (draftId) {
          await updateHackathonDraft(draftId, payload);
        } else {
          const d = await createHackathonDraft(payload);
          setDraftId(d.draftId);
        }
        setDraftStatus("saved");
      } catch {
        setDraftStatus("idle");
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [form, questions, isEdit, isVerifiedOrg, draftId, resumeOffer]);

  const continueDraft = () => {
    if (!resumeOffer) return;
    restore(resumeOffer.payload);
    setDraftId(resumeOffer.draftId);
    setResumeOffer(null);
  };
  const discardDraft = () => {
    if (!resumeOffer) return;
    void deleteHackathonDraft(resumeOffer.draftId).catch(() => {});
    setResumeOffer(null);
  };

  // Gate: anonymous visitors, non-organization accounts and — per SSU2 —
  // organizations that are not yet (or no longer) admin-verified.
  if (status !== "loading" && !isVerifiedOrg) {
    const pendingView = isOrg && (orgStatus === "pending" || resubmitState === "done");
    const rejectedView = isOrg && orgStatus === "rejected" && resubmitState !== "done";

    const handleResubmit = () => {
      setResubmitState("busy");
      resubmitOrgVerification()
        .then(() => setResubmitState("done"))
        .catch(() => setResubmitState("error"));
    };

    return (
      <AppShell right={<RailRight />}>
        <main className="nh-page" id="nh-main">
          <header className="page-head nh-head">
            <Link className="col-back" href="/hackathons" aria-label={t("back")}>
              <Icon name="arrow-left" />
            </Link>
            <div className="col-titles">
              <h1 className="page-title">
                <Icon name="hackathon" /> {t("pageTitle")}
              </h1>
              <p className="page-sub">{t("pageSub")}</p>
            </div>
          </header>

          <div className="nh-gate">
            <div className="nh-gate-icon" aria-hidden="true">
              <Icon name="shield" />
            </div>
            <h2 className="nh-gate-title">
              {pendingView
                ? t("gatePendingTitle")
                : rejectedView
                  ? t("gateRejectedTitle")
                  : t("gateTitle")}
            </h2>
            {pendingView ? (
              <p className="nh-gate-body">
                {resubmitState === "done" ? t("gateResubmitted") : t("gatePendingBody")}
              </p>
            ) : rejectedView ? (
              <p className="nh-gate-body">
                {t("gateRejectedBody")}
                {user?.organization?.rejectionReason
                  ? ` ${t("gateReasonLabel")}: ${user.organization.rejectionReason}`
                  : ""}
                {resubmitState === "error" ? ` ${t("gateResubmitError")}` : ""}
              </p>
            ) : (
              <p className="nh-gate-body">{user ? t("gateBody") : t("gateBodyAnon")}</p>
            )}
            <div className="nh-gate-actions">
              {!user && (
                <Link className="btn btn-primary" href="/login">
                  {t("gateLogin")}
                </Link>
              )}
              {rejectedView && (
                <button
                  className="btn btn-primary"
                  onClick={handleResubmit}
                  disabled={resubmitState === "busy"}
                >
                  {resubmitState === "busy" ? t("gateResubmitting") : t("gateResubmit")}
                </button>
              )}
              <Link className="btn btn-ghost" href="/hackathons">
                {t("gateBrowse")}
              </Link>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  // Validation — mirrors the backend 400 rules
  function validate(): Errors {
    const e: Errors = {};
    if (!form.title.trim()) e.title = t("errTitle");
    if (!form.description.trim()) e.description = t("errDescription");
    if (!form.startsAt) e.startsAt = t("errStartsAt");
    if (!form.endsAt) e.endsAt = t("errEndsAt");
    if (!form.registrationDeadline) e.registrationDeadline = t("errRegDeadline");

    const start = form.startsAt ? new Date(form.startsAt).getTime() : NaN;
    const end = form.endsAt ? new Date(form.endsAt).getTime() : NaN;
    const deadline = form.registrationDeadline
      ? new Date(form.registrationDeadline).getTime()
      : NaN;

    if (!e.startsAt && !e.endsAt && start >= end) e.endsAt = t("errEndBeforeStart");
    if (!e.registrationDeadline && !e.startsAt && deadline >= start)
      e.registrationDeadline = t("errDeadlineAfterStart");

    if (form.maxParticipants.trim() !== "") {
      const max = Number(form.maxParticipants);
      if (!Number.isFinite(max) || max <= 0) e.maxParticipants = t("errMaxParticipants");
    }

    const minTeam = Number(form.minTeamSize);
    const maxTeam = Number(form.maxTeamSize);
    if (!Number.isFinite(minTeam) || minTeam < 1) e.minTeamSize = t("errMinTeamSize");
    if (!Number.isFinite(maxTeam) || maxTeam < Math.max(1, minTeam))
      e.maxTeamSize = t("errMaxTeamSize");

    // lat/lng are always paired; non-virtual additionally requires both + location.
    const hasLat = form.latitude.trim() !== "";
    const hasLng = form.longitude.trim() !== "";
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);

    if (needsLocation) {
      if (!form.location.trim()) e.location = t("errLocation");
      if (!hasLat || !hasLng) {
        if (!hasLat) e.latitude = t("errLatLng");
        if (!hasLng) e.longitude = t("errLatLng");
      }
    } else if (hasLat !== hasLng) {
      // virtual but only one of the pair filled
      if (!hasLat) e.latitude = t("errLatLngPaired");
      if (!hasLng) e.longitude = t("errLatLngPaired");
    }

    if (hasLat && (!Number.isFinite(lat) || lat < -90 || lat > 90)) e.latitude = t("errLatRange");
    if (hasLng && (!Number.isFinite(lng) || lng < -180 || lng > 180))
      e.longitude = t("errLngRange");

    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;

    const hasLat = form.latitude.trim() !== "";
    const hasLng = form.longitude.trim() !== "";

    setSubmitting(true);
    try {
      if (isEdit && hackathonId) {
        await updateHackathon(hackathonId, {
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          theme: form.theme.trim() || null,
          startsAt: toIso(form.startsAt),
          endsAt: toIso(form.endsAt),
          registrationDeadline: toIso(form.registrationDeadline),
          maxParticipants: form.maxParticipants.trim() !== "" ? Number(form.maxParticipants) : null,
          minTeamSize: Number(form.minTeamSize),
          maxTeamSize: Number(form.maxTeamSize),
          location: needsLocation ? form.location.trim() : null,
          latitude: hasLat ? Number(form.latitude) : null,
          longitude: hasLng ? Number(form.longitude) : null,
          logoUrl: form.logoUrl || null,
          bannerUrl: form.bannerUrl || null,
        });
        await reconcileQuestions(hackathonId);
        router.push(`/hackathons/${hackathonId}`);
      } else {
        await createHackathon({
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          theme: form.theme.trim() || undefined,
          startsAt: toIso(form.startsAt),
          endsAt: toIso(form.endsAt),
          registrationDeadline: toIso(form.registrationDeadline),
          maxParticipants:
            form.maxParticipants.trim() !== "" ? Number(form.maxParticipants) : undefined,
          minTeamSize: Number(form.minTeamSize),
          maxTeamSize: Number(form.maxTeamSize),
          location: needsLocation ? form.location.trim() : form.location.trim() || undefined,
          latitude: hasLat ? Number(form.latitude) : undefined,
          longitude: hasLng ? Number(form.longitude) : undefined,
          logoUrl: form.logoUrl || undefined,
          bannerUrl: form.bannerUrl || undefined,
          questions: toPublishQuestions(questions),
          draftId: draftId ?? undefined,
        });
        router.push("/hackathons");
      }
    } catch (err) {
      setServerError(err instanceof ApiError || err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  }

  /**
   * Edit mode: bring the server's question set in line with the builder — create
   * the new ones, update the touched existing ones, delete the removed ones.
   * Sequential to keep positions stable and errors attributable.
   */
  async function reconcileQuestions(id: string) {
    const kept = questions.filter((q) => q.prompt.trim() !== "");
    const keptIds = new Set(kept.map((q) => q.questionId).filter((x): x is string => !!x));
    for (const gone of initialQuestionIds.current.filter((qid) => !keptIds.has(qid))) {
      await deleteApplicationQuestion(gone);
    }
    for (let i = 0; i < kept.length; i++) {
      const q = kept[i];
      const isChoice = q.type === "single_choice" || q.type === "multi_choice";
      const body = {
        prompt: q.prompt.trim(),
        type: q.type,
        options: isChoice ? q.options.map((o) => o.trim()).filter(Boolean) : undefined,
        required: q.required,
        allowOther: isChoice ? q.allowOther : false,
        position: i,
      };
      if (q.questionId) {
        await updateApplicationQuestion(q.questionId, body);
      } else {
        await createApplicationQuestion(id, body);
      }
    }
    initialQuestionIds.current = kept.map((q) => q.questionId).filter((x): x is string => !!x);
  }

  async function onPickImage(kind: "logo" | "banner", ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setServerError(null);
    setUploading(kind);
    try {
      const { url } = await uploadGroupIcon(file);
      set(kind === "logo" ? "logoUrl" : "bannerUrl", url);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(null);
    }
  }

  const typeLabel = (ty: HackathonType): string =>
    ty === "virtual" ? t("typeVirtual") : ty === "hybrid" ? t("typeHybrid") : t("typePhysical");

  return (
    <AppShell right={<RailRight />}>
      <main className="nh-page" id="nh-main">
        <header className="page-head nh-head">
          <Link className="col-back" href="/hackathons" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="hackathon" /> {isEdit ? t("editTitle") : t("pageTitle")}
            </h1>
            <p className="page-sub">{isEdit ? t("editSub") : t("pageSub")}</p>
          </div>
        </header>

        {isEdit && loadingData ? (
          <p className="nh-hint" style={{ padding: "8px 4px" }}>
            {t("loading")}
          </p>
        ) : (
          <form className="nh-form" onSubmit={onSubmit} noValidate>
            {resumeOffer && (
              <div className="nh-resume" role="alert">
                <div className="nh-resume-text">
                  <strong>{t("resumeTitle")}</strong>
                  <span>{t("resumeBody")}</span>
                </div>
                <div className="nh-resume-actions">
                  <button type="button" className="btn btn-ghost hk-btn-sm" onClick={discardDraft}>
                    {t("resumeDiscard")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-violet hk-btn-sm"
                    onClick={continueDraft}
                  >
                    <Icon name="check" /> {t("resumeContinue")}
                  </button>
                </div>
              </div>
            )}
            {/* BASICS */}
            <section className="nh-section">
              <h2 className="nh-section-title">{t("secBasics")}</h2>

              <div className="nh-field">
                <label className="nh-label" htmlFor="nh-title">
                  {t("fTitle")}
                </label>
                <input
                  id="nh-title"
                  className={`nh-input${errors.title ? " nh-input-err" : ""}`}
                  value={form.title}
                  placeholder={t("fTitlePh")}
                  onChange={(e) => set("title", e.target.value)}
                  aria-invalid={!!errors.title}
                />
                {errors.title && <p className="nh-err">{errors.title}</p>}
              </div>

              <div className="nh-field">
                <label className="nh-label" htmlFor="nh-desc">
                  {t("fDescription")}
                </label>
                <textarea
                  id="nh-desc"
                  className={`nh-textarea${errors.description ? " nh-input-err" : ""}`}
                  rows={4}
                  value={form.description}
                  placeholder={t("fDescriptionPh")}
                  onChange={(e) => set("description", e.target.value)}
                  aria-invalid={!!errors.description}
                />
                {errors.description && <p className="nh-err">{errors.description}</p>}
              </div>

              <div className="nh-field">
                <label className="nh-label" htmlFor="nh-theme">
                  {t("fTheme")} <span className="nh-opt">{t("fThemeOpt")}</span>
                </label>
                <input
                  id="nh-theme"
                  className="nh-input"
                  value={form.theme}
                  placeholder={t("fThemePh")}
                  onChange={(e) => set("theme", e.target.value)}
                />
              </div>
            </section>

            {/* FORMAT & LOCATION */}
            <section className="nh-section">
              <h2 className="nh-section-title">{t("secFormat")}</h2>

              <div className="nh-field">
                <span className="nh-label">{t("fType")}</span>
                <div className="nh-type-row" role="radiogroup" aria-label={t("fType")}>
                  {HACKATHON_TYPE.map((ty) => (
                    <button
                      type="button"
                      key={ty}
                      className={`nh-type${form.type === ty ? " nh-type-on" : ""}`}
                      role="radio"
                      aria-checked={form.type === ty}
                      onClick={() => set("type", ty)}
                    >
                      {typeLabel(ty)}
                    </button>
                  ))}
                </div>
              </div>

              {needsLocation && (
                <>
                  <p className="nh-hint">{t("locationHint")}</p>
                  <div className="nh-field">
                    <label className="nh-label" htmlFor="nh-loc">
                      {t("fLocation")}
                    </label>
                    <input
                      id="nh-loc"
                      className={`nh-input${errors.location ? " nh-input-err" : ""}`}
                      value={form.location}
                      placeholder={t("fLocationPh")}
                      onChange={(e) => set("location", e.target.value)}
                      aria-invalid={!!errors.location}
                    />
                    {errors.location && <p className="nh-err">{errors.location}</p>}
                  </div>
                  <div className="nh-grid-2">
                    <div className="nh-field">
                      <label className="nh-label" htmlFor="nh-lat">
                        {t("fLatitude")}
                      </label>
                      <input
                        id="nh-lat"
                        className={`nh-input${errors.latitude ? " nh-input-err" : ""}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={form.latitude}
                        onChange={(e) => set("latitude", e.target.value)}
                        aria-invalid={!!errors.latitude}
                      />
                      {errors.latitude && <p className="nh-err">{errors.latitude}</p>}
                    </div>
                    <div className="nh-field">
                      <label className="nh-label" htmlFor="nh-lng">
                        {t("fLongitude")}
                      </label>
                      <input
                        id="nh-lng"
                        className={`nh-input${errors.longitude ? " nh-input-err" : ""}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={form.longitude}
                        onChange={(e) => set("longitude", e.target.value)}
                        aria-invalid={!!errors.longitude}
                      />
                      {errors.longitude && <p className="nh-err">{errors.longitude}</p>}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* SCHEDULE */}
            <section className="nh-section">
              <h2 className="nh-section-title">{t("secSchedule")}</h2>
              <div className="nh-grid-2">
                <div className="nh-field">
                  <label className="nh-label" htmlFor="nh-start">
                    {t("fStartsAt")}
                  </label>
                  <input
                    id="nh-start"
                    className={`nh-input${errors.startsAt ? " nh-input-err" : ""}`}
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                    aria-invalid={!!errors.startsAt}
                  />
                  {errors.startsAt && <p className="nh-err">{errors.startsAt}</p>}
                </div>
                <div className="nh-field">
                  <label className="nh-label" htmlFor="nh-end">
                    {t("fEndsAt")}
                  </label>
                  <input
                    id="nh-end"
                    className={`nh-input${errors.endsAt ? " nh-input-err" : ""}`}
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)}
                    aria-invalid={!!errors.endsAt}
                  />
                  {errors.endsAt && <p className="nh-err">{errors.endsAt}</p>}
                </div>
              </div>
              <div className="nh-field">
                <label className="nh-label" htmlFor="nh-reg">
                  {t("fRegDeadline")}
                </label>
                <input
                  id="nh-reg"
                  className={`nh-input${errors.registrationDeadline ? " nh-input-err" : ""}`}
                  type="datetime-local"
                  value={form.registrationDeadline}
                  onChange={(e) => set("registrationDeadline", e.target.value)}
                  aria-invalid={!!errors.registrationDeadline}
                />
                {errors.registrationDeadline && (
                  <p className="nh-err">{errors.registrationDeadline}</p>
                )}
              </div>
            </section>

            {/* TEAMS & CAPACITY */}
            <section className="nh-section">
              <h2 className="nh-section-title">{t("secTeams")}</h2>
              <div className="nh-grid-2">
                <div className="nh-field">
                  <label className="nh-label" htmlFor="nh-min">
                    {t("fMinTeamSize")}
                  </label>
                  <input
                    id="nh-min"
                    className={`nh-input${errors.minTeamSize ? " nh-input-err" : ""}`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.minTeamSize}
                    onChange={(e) => set("minTeamSize", e.target.value)}
                    aria-invalid={!!errors.minTeamSize}
                  />
                  {errors.minTeamSize && <p className="nh-err">{errors.minTeamSize}</p>}
                </div>
                <div className="nh-field">
                  <label className="nh-label" htmlFor="nh-max">
                    {t("fMaxTeamSize")}
                  </label>
                  <input
                    id="nh-max"
                    className={`nh-input${errors.maxTeamSize ? " nh-input-err" : ""}`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.maxTeamSize}
                    onChange={(e) => set("maxTeamSize", e.target.value)}
                    aria-invalid={!!errors.maxTeamSize}
                  />
                  {errors.maxTeamSize && <p className="nh-err">{errors.maxTeamSize}</p>}
                </div>
              </div>
              <div className="nh-field">
                <label className="nh-label" htmlFor="nh-cap">
                  {t("fMaxParticipants")} <span className="nh-opt">{t("fThemeOpt")}</span>
                </label>
                <input
                  id="nh-cap"
                  className={`nh-input${errors.maxParticipants ? " nh-input-err" : ""}`}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={form.maxParticipants}
                  placeholder={t("fMaxPartPh")}
                  onChange={(e) => set("maxParticipants", e.target.value)}
                  aria-invalid={!!errors.maxParticipants}
                />
                {errors.maxParticipants && <p className="nh-err">{errors.maxParticipants}</p>}
              </div>
            </section>

            {/* MEDIA */}
            <section className="nh-section">
              <h2 className="nh-section-title">{t("secMedia")}</h2>
              <div className="nh-grid-2">
                <div className="nh-field">
                  <span className="nh-label">
                    {t("fLogo")} <span className="nh-opt">{t("fThemeOpt")}</span>
                  </span>
                  <div className="nh-media">
                    {form.logoUrl ? (
                      <div className="nh-media-preview nh-media-logo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.logoUrl} alt="" loading="lazy" />
                      </div>
                    ) : (
                      <div className="nh-media-empty nh-media-logo" aria-hidden="true">
                        <Icon name="image" />
                      </div>
                    )}
                    <div className="nh-media-actions">
                      <button
                        type="button"
                        className="btn btn-ghost hk-btn-sm"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploading === "logo"}
                      >
                        {uploading === "logo" ? t("uploading") : t("upload")}
                      </button>
                      {form.logoUrl && (
                        <button
                          type="button"
                          className="nh-media-remove"
                          onClick={() => set("logoUrl", "")}
                        >
                          {t("remove")}
                        </button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => onPickImage("logo", e)}
                    />
                  </div>
                </div>

                <div className="nh-field">
                  <span className="nh-label">
                    {t("fBanner")} <span className="nh-opt">{t("fThemeOpt")}</span>
                  </span>
                  <div className="nh-media">
                    {form.bannerUrl ? (
                      <div className="nh-media-preview nh-media-banner">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.bannerUrl} alt="" loading="lazy" />
                      </div>
                    ) : (
                      <div className="nh-media-empty nh-media-banner" aria-hidden="true">
                        <Icon name="image" />
                      </div>
                    )}
                    <div className="nh-media-actions">
                      <button
                        type="button"
                        className="btn btn-ghost hk-btn-sm"
                        onClick={() => bannerInputRef.current?.click()}
                        disabled={uploading === "banner"}
                      >
                        {uploading === "banner" ? t("uploading") : t("upload")}
                      </button>
                      {form.bannerUrl && (
                        <button
                          type="button"
                          className="nh-media-remove"
                          onClick={() => set("bannerUrl", "")}
                        >
                          {t("remove")}
                        </button>
                      )}
                    </div>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => onPickImage("banner", e)}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* APPLICATION FORM (questions) */}
            <QuestionBuilder value={questions} onChange={setQuestions} />

            {serverError && <p className="nh-server-err">{serverError}</p>}

            <div className="nh-foot">
              {!isEdit && draftStatus !== "idle" && (
                <span className="nh-draft-status">
                  <Icon name={draftStatus === "saving" ? "clock" : "check"} />{" "}
                  {draftStatus === "saving" ? t("draftSaving") : t("draftSaved")}
                </span>
              )}
              <Link
                className="btn btn-ghost"
                href={isEdit && hackathonId ? `/hackathons/${hackathonId}` : "/hackathons"}
              >
                {t("cancel")}
              </Link>
              <button className="btn btn-primary nh-submit" type="submit" disabled={submitting}>
                <Icon name="check" />{" "}
                {submitting
                  ? isEdit
                    ? t("saving")
                    : t("submitting")
                  : isEdit
                    ? t("saveChanges")
                    : t("submit")}
              </button>
            </div>
          </form>
        )}
      </main>
    </AppShell>
  );
}

export default NewHackathonClient;
