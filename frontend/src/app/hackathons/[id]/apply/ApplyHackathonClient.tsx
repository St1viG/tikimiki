"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HackathonSummary, HackathonType } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { initials } from "@/lib/format";
import {
  ApiError,
  applyToHackathon,
  applyToHackathonAsTeam,
  getApplicationQuestions,
  getHackathon,
  getMyApplications,
  getMyTeams,
  type AnswerInput,
  type Application,
  type ApplicationQuestion,
  type Team,
} from "@/lib/api";

/**
 * ApplyHackathonClient — full-page hackathon application.
 *
 * Mirrors (and replaces, on a dedicated route) ApplyHackathonPopup's capability:
 *   - Header from GET /hackathons/:id (title, organizer, dates, location, prize,
 *     participant count) — every field rendered only when non-null.
 *   - Team selection: solo, or one of the viewer's teams for THIS hackathon
 *     (GET /teams/me filtered by hackathonId).
 *   - The organizer's custom questions (GET /applications/hackathon/:id/questions)
 *     rendered by type, with required-question validation.
 *   - Submit via POST /applications; 409 → friendly "already applied" state.
 *
 * States: loading (skeleton) · anonymous (sign-in prompt) · already-applied ·
 * the form · success confirmation.
 */

const M = {
  back: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Apply", sr: "Prijava" },

  loading: { en: "Loading…", sr: "Učitavanje…" },
  notFound: { en: "Hackathon not found.", sr: "Hackathon nije pronađen." },
  browse: { en: "Browse hackathons", sr: "Pregledaj hackathone" },

  by: { en: "by", sr: "organizuje" },
  verifiedOrg: { en: "Verified organizer", sr: "Verifikovan organizator" },
  metaParticipants: { en: "Participants", sr: "Učesnici" },
  metaPrize: { en: "Main prize", sr: "Glavna nagrada" },
  metaDeadline: { en: "Apply by", sr: "Rok za prijavu" },

  // Anonymous
  anonTitle: { en: "Sign in to apply", sr: "Prijavi se da konkurišeš" },
  anonBody: {
    en: "You need an account to apply to this hackathon.",
    sr: "Potreban ti je nalog da bi se prijavio na ovaj hackathon.",
  },
  login: { en: "Sign in", sr: "Prijava" },

  // Already applied
  appliedTitle: { en: "You've applied", sr: "Već si se prijavio" },
  appliedBody: {
    en: "Your application to this hackathon is in.",
    sr: "Tvoja prijava za ovaj hackathon je poslata.",
  },
  appliedTeam: { en: "Team", sr: "Tim" },
  appliedSolo: { en: "Applied solo", sr: "Prijava pojedinačno" },
  statusPending: { en: "Pending review", sr: "Na čekanju" },
  statusApproved: { en: "Approved", sr: "Odobreno" },
  statusRejected: { en: "Rejected", sr: "Odbijeno" },
  statusWaitlisted: { en: "Waitlisted", sr: "Lista čekanja" },

  // Success
  successTitle: { en: "Application sent", sr: "Prijava poslata" },
  successBody: {
    en: "The organizer will review your application. You'll be notified of the decision.",
    sr: "Organizator će pregledati tvoju prijavu. Bićeš obavešten o odluci.",
  },
  backToHacks: { en: "Back to hackathons", sr: "Nazad na hackathone" },

  // Team selection
  teamSection: { en: "How are you applying?", sr: "Kako se prijavljuješ?" },
  applySolo: { en: "Solo", sr: "Pojedinačno" },
  applySoloSub: { en: "Apply on your own.", sr: "Prijavi se samostalno." },
  withTeam: { en: "With my team", sr: "Sa svojim timom" },
  members: { en: "members", sr: "članova" },

  // Questions
  questionsSection: { en: "Application questions", sr: "Pitanja za prijavu" },
  required: { en: "required", sr: "obavezno" },
  optional: { en: "optional", sr: "opciono" },
  noQuestions: {
    en: "No extra questions — just confirm to apply.",
    sr: "Nema dodatnih pitanja — samo potvrdi prijavu.",
  },
  otherOption: { en: "Other", sr: "Ostalo" },
  otherPlaceholder: { en: "Please specify…", sr: "Navedi…" },

  // Submit
  submit: { en: "Submit application", sr: "Pošalji prijavu" },
  submitting: { en: "Submitting…", sr: "Slanje…" },
  cancel: { en: "Cancel", sr: "Otkaži" },
  fillRequired: {
    en: "Please answer all required questions.",
    sr: "Odgovori na sva obavezna pitanja.",
  },
  already: {
    en: "You already applied to this hackathon.",
    sr: "Već si se prijavio na ovaj hackathon.",
  },

  typePhysical: { en: "Physical", sr: "Fizički" },
  typeVirtual: { en: "Virtual", sr: "Virtuelni" },
  typeHybrid: { en: "Hybrid", sr: "Hibridni" },
} as const;

type AnswerMap = Record<string, string | string[]>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDMY(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}
function dateRange(aIso: string, bIso: string): string {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (a.toDateString() === b.toDateString()) return fmtDMY(a);
  return `${fmtDMY(a)} – ${fmtDMY(b)}`;
}

export function ApplyHackathonClient({ hackathonId }: { hackathonId: string }) {
  const t = useT(M);
  const { user, status } = useAuth();

  const typeLabel = (ty: HackathonType): string =>
    ty === "virtual" ? t("typeVirtual") : ty === "hybrid" ? t("typeHybrid") : t("typePhysical");

  const [hack, setHack] = useState<HackathonSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [questions, setQuestions] = useState<ApplicationQuestion[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [existing, setExisting] = useState<Application | null>(null);

  const [teamChoice, setTeamChoice] = useState<string>("solo");
  const [answers, setAnswers] = useState<AnswerMap>({});
  // "Other (free text)" state per question, for choice questions that allow it.
  const [otherOn, setOtherOn] = useState<Record<string, boolean>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Hackathon + questions are public endpoints — loaded without checking auth status;
  // the auth check only gates whether the form itself is rendered.
  useEffect(() => {
    let cancelled = false;
    getHackathon(hackathonId)
      .then((h) => !cancelled && setHack(h))
      .catch(() => !cancelled && setLoadFailed(true));
    getApplicationQuestions(hackathonId)
      .then((q) => !cancelled && setQuestions(q))
      .catch(() => !cancelled && setQuestions([]));
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // The viewer's teams for this hackathon + any existing application (signed-in).
  useEffect(() => {
    if (!user) {
      setTeams([]);
      setExisting(null);
      return;
    }
    let cancelled = false;
    // getMyTeams() returns ALL the viewer's teams across hackathons; filter to
    // this hackathon so only relevant teams appear in the team-selection section.
    getMyTeams()
      .then((all) => {
        if (!cancelled) setTeams(all.filter((tm) => tm.hackathonId === hackathonId));
      })
      .catch(() => !cancelled && setTeams([]));
    getMyApplications()
      .then((apps) => {
        if (!cancelled) {
          setExisting(apps.find((a) => a.hackathonId === hackathonId) ?? null);
        }
      })
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [user, hackathonId]);

  const setAnswer = (qid: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const toggleMulti = (qid: string, option: string) =>
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      return {
        ...prev,
        [qid]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option],
      };
    });

  const setOther = (qid: string, on: boolean) => setOtherOn((prev) => ({ ...prev, [qid]: on }));
  const setOtherTextFor = (qid: string, v: string) =>
    setOtherText((prev) => ({ ...prev, [qid]: v }));

  /**
   * The value actually submitted for a question, folding in the "Other" free
   * text: for single_choice it replaces the selection; for multi_choice it is
   * appended to the picked options. Stored as human-readable text.
   */
  const effectiveAnswer = (q: ApplicationQuestion): string => {
    const other =
      q.allowOther && otherOn[q.questionId] ? (otherText[q.questionId] ?? "").trim() : "";
    if (q.type === "multi_choice") {
      const picked = Array.isArray(answers[q.questionId])
        ? (answers[q.questionId] as string[])
        : [];
      return [...picked, ...(other ? [other] : [])].join(", ");
    }
    if (q.type === "single_choice") {
      if (q.allowOther && otherOn[q.questionId]) return other;
      return ((answers[q.questionId] as string) ?? "").trim();
    }
    const v = answers[q.questionId];
    return (Array.isArray(v) ? v.join(", ") : (v ?? "")).trim();
  };

  async function submit() {
    if (!user || !questions) return;
    const missing = questions.some((q) => q.required && effectiveAnswer(q) === "");
    if (missing) {
      setError(t("fillRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: AnswerInput[] = questions
      .map((q) => ({ questionId: q.questionId, answer: effectiveAnswer(q) }))
      .filter((a) => a.answer !== "");
    const teamId = teamChoice === "solo" ? undefined : teamChoice;
    try {
      // SSU10: applying with a team submits one application per active team
      // member through the dedicated team endpoint; solo keeps the single one.
      if (teamId) {
        await applyToHackathonAsTeam(hackathonId, teamId, payload);
      } else {
        await applyToHackathon(hackathonId, teamId, payload);
      }
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t("already"));
      else setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = (s: string): string =>
    s === "approved"
      ? t("statusApproved")
      : s === "rejected"
        ? t("statusRejected")
        : s === "waitlisted"
          ? t("statusWaitlisted")
          : t("statusPending");
  const statusClass = (s: string): string =>
    s === "approved"
      ? "hk-apply-approved"
      : s === "rejected"
        ? "hk-apply-rejected"
        : s === "waitlisted"
          ? "hk-apply-waitlisted"
          : "hk-apply-pending";

  /* Header (shared across states) */
  const header = (
    <header className="page-head ap-head">
      <Link className="col-back" href="/hackathons" aria-label={t("back")}>
        <Icon name="arrow-left" />
      </Link>
      <div className="col-titles">
        <h1 className="page-title">
          <Icon name="hackathon" /> {t("pageTitle")}
        </h1>
        <p className="page-sub">{hack?.title ?? ""}</p>
      </div>
    </header>
  );

  /* Loading / not-found */
  if (hack === null) {
    return (
      <AppShell right={<RailRight />}>
        <main className="ap-page" id="ap-main">
          {header}
          {loadFailed ? (
            <div className="ap-state">
              <h2 className="ap-state-title">{t("notFound")}</h2>
              <Link className="btn btn-ghost" href="/hackathons">
                {t("browse")}
              </Link>
            </div>
          ) : (
            <div className="ap-hero" aria-busy="true">
              <span className="skel skel-line" style={{ width: "40%", height: 14 }} />
              <span
                className="skel skel-line"
                style={{ width: "70%", height: 26, marginTop: 12 }}
              />
              <span
                className="skel skel-line"
                style={{ width: "55%", height: 13, marginTop: 12 }}
              />
            </div>
          )}
        </main>
      </AppShell>
    );
  }

  /* Hackathon hero card (rendered in every non-error state) */
  const hero = (
    <div className="ap-hero">
      {hack.bannerUrl && (
        <div className="ap-hero-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hack.bannerUrl} alt="" loading="lazy" />
          <div className="ap-hero-dim" aria-hidden="true" />
        </div>
      )}
      <div className="ap-hero-body">
        <div className="ap-org">
          <div className="ap-org-av" aria-hidden="true">
            {hack.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hack.logoUrl} alt="" />
            ) : (
              initials(hack.organizationName)
            )}
          </div>
          <span className="ap-org-name">
            {t("by")} <strong>{hack.organizationName}</strong>
          </span>
          {hack.organizationVerified && (
            <span className="hk-verify" title={t("verifiedOrg")}>
              <Icon name="shield" />
            </span>
          )}
        </div>
        <h2 className="ap-hero-title">{hack.title}</h2>
        <div className="ap-hero-tags">
          <span className="tag tag-v">{typeLabel(hack.type)}</span>
          {hack.theme && <span className="tag tag-v">{hack.theme}</span>}
        </div>
        <div className="ap-hero-meta">
          <div className="ap-meta-item">
            <Icon name="calendar" />
            <span>{dateRange(hack.startsAt, hack.endsAt)}</span>
          </div>
          {hack.location && (
            <div className="ap-meta-item">
              <Icon name="location" />
              <span>{hack.location}</span>
            </div>
          )}
          <div className="ap-meta-item">
            <Icon name="teams" />
            <span>
              {hack.participantCount}
              {hack.maxParticipants !== null ? `/${hack.maxParticipants}` : ""}{" "}
              {t("metaParticipants").toLowerCase()}
            </span>
          </div>
          {hack.prizePool && (
            <div className="ap-meta-item ap-meta-prize">
              <Icon name="trophy" />
              <span>{hack.prizePool}</span>
            </div>
          )}
          <div className="ap-meta-item">
            <Icon name="clock" />
            <span>
              {t("metaDeadline")} {fmtDMY(new Date(hack.registrationDeadline))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  /* Anonymous */
  if (status !== "loading" && !user) {
    return (
      <AppShell right={<RailRight />}>
        <main className="ap-page" id="ap-main">
          {header}
          {hero}
          <div className="ap-state">
            <div className="ap-state-icon" aria-hidden="true">
              <Icon name="flag" />
            </div>
            <h2 className="ap-state-title">{t("anonTitle")}</h2>
            <p className="ap-state-body">{t("anonBody")}</p>
            <Link className="btn btn-primary" href="/login">
              {t("login")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  /* Success */
  if (done) {
    return (
      <AppShell right={<RailRight />}>
        <main className="ap-page" id="ap-main">
          {header}
          {hero}
          <div className="ap-state ap-state-success">
            <div className="ap-state-icon ap-state-icon-ok" aria-hidden="true">
              <Icon name="check" />
            </div>
            <h2 className="ap-state-title">{t("successTitle")}</h2>
            <p className="ap-state-body">{t("successBody")}</p>
            <Link className="btn btn-primary" href="/hackathons">
              {t("backToHacks")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  /* Already applied */
  if (existing) {
    return (
      <AppShell right={<RailRight />}>
        <main className="ap-page" id="ap-main">
          {header}
          {hero}
          <div className="ap-state">
            <div className="ap-state-icon" aria-hidden="true">
              <Icon name="check" />
            </div>
            <h2 className="ap-state-title">{t("appliedTitle")}</h2>
            <p className="ap-state-body">{t("appliedBody")}</p>
            <div className="ap-applied-row">
              <span className={`hk-apply-status ${statusClass(existing.status)}`}>
                <Icon
                  name={
                    existing.status === "approved"
                      ? "check"
                      : existing.status === "rejected"
                        ? "x"
                        : "clock"
                  }
                />{" "}
                {statusLabel(existing.status)}
              </span>
              <span className="ap-applied-meta">
                {existing.teamName ? (
                  <>
                    {t("appliedTeam")} <strong>{existing.teamName}</strong>
                  </>
                ) : (
                  t("appliedSolo")
                )}
              </span>
            </div>
            <Link className="btn btn-ghost" href="/hackathons">
              {t("backToHacks")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  /* The application form */
  return (
    <AppShell right={<RailRight />}>
      <main className="ap-page" id="ap-main">
        {header}
        {hero}

        <div className="ap-form">
          {/* Team selection — only when the viewer has a team for this hackathon */}
          {teams.length > 0 && (
            <section className="ap-section">
              <h3 className="ap-section-title">{t("teamSection")}</h3>
              <div className="ap-team-options">
                <label className={`ap-team-opt${teamChoice === "solo" ? " ap-team-opt-on" : ""}`}>
                  <input
                    type="radio"
                    name="ap-team"
                    checked={teamChoice === "solo"}
                    onChange={() => setTeamChoice("solo")}
                  />
                  <span className="ap-team-body">
                    <span className="ap-team-name">{t("applySolo")}</span>
                    <span className="ap-team-sub">{t("applySoloSub")}</span>
                  </span>
                </label>
                {teams.map((tm) => (
                  <label
                    key={tm.teamId}
                    className={`ap-team-opt${teamChoice === tm.teamId ? " ap-team-opt-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name="ap-team"
                      checked={teamChoice === tm.teamId}
                      onChange={() => setTeamChoice(tm.teamId)}
                    />
                    <span className="ap-team-body">
                      <span className="ap-team-name">{tm.name}</span>
                      <span className="ap-team-sub">
                        {tm.memberCount} {t("members")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Questions */}
          <section className="ap-section">
            <h3 className="ap-section-title">{t("questionsSection")}</h3>
            {questions === null ? (
              <div className="ap-q-loading" aria-busy="true">
                <span className="skel skel-line" style={{ width: "30%" }} />
                <span
                  className="skel skel-line"
                  style={{ width: "100%", height: 42, marginTop: 8 }}
                />
              </div>
            ) : questions.length === 0 ? (
              <p className="ap-note">{t("noQuestions")}</p>
            ) : (
              <div className="ap-q-list">
                {questions.map((q) => (
                  <div className="ap-field" key={q.questionId}>
                    <label className="ap-q-label">
                      {q.prompt}{" "}
                      <span className="ap-q-req">
                        ({q.required ? t("required") : t("optional")})
                      </span>
                    </label>

                    {q.type === "short_text" && (
                      <input
                        className="ap-input"
                        value={(answers[q.questionId] as string) ?? ""}
                        onChange={(e) => setAnswer(q.questionId, e.target.value)}
                      />
                    )}

                    {q.type === "long_text" && (
                      <textarea
                        className="ap-textarea"
                        rows={4}
                        value={(answers[q.questionId] as string) ?? ""}
                        onChange={(e) => setAnswer(q.questionId, e.target.value)}
                      />
                    )}

                    {q.type === "single_choice" && (
                      <div className="ap-choices">
                        {(q.options ?? []).map((opt) => (
                          <label key={opt} className="ap-choice">
                            <input
                              type="radio"
                              name={q.questionId}
                              checked={!otherOn[q.questionId] && answers[q.questionId] === opt}
                              onChange={() => {
                                setAnswer(q.questionId, opt);
                                setOther(q.questionId, false);
                              }}
                            />
                            {opt}
                          </label>
                        ))}
                        {q.allowOther && (
                          <>
                            <label className="ap-choice">
                              <input
                                type="radio"
                                name={q.questionId}
                                checked={!!otherOn[q.questionId]}
                                onChange={() => {
                                  setOther(q.questionId, true);
                                  setAnswer(q.questionId, "");
                                }}
                              />
                              {t("otherOption")}
                            </label>
                            {otherOn[q.questionId] && (
                              <input
                                className="ap-input"
                                placeholder={t("otherPlaceholder")}
                                value={otherText[q.questionId] ?? ""}
                                onChange={(e) => setOtherTextFor(q.questionId, e.target.value)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {q.type === "multi_choice" && (
                      <div className="ap-choices">
                        {(q.options ?? []).map((opt) => (
                          <label key={opt} className="ap-choice">
                            <input
                              type="checkbox"
                              checked={
                                Array.isArray(answers[q.questionId]) &&
                                (answers[q.questionId] as string[]).includes(opt)
                              }
                              onChange={() => toggleMulti(q.questionId, opt)}
                            />
                            {opt}
                          </label>
                        ))}
                        {q.allowOther && (
                          <>
                            <label className="ap-choice">
                              <input
                                type="checkbox"
                                checked={!!otherOn[q.questionId]}
                                onChange={(e) => setOther(q.questionId, e.target.checked)}
                              />
                              {t("otherOption")}
                            </label>
                            {otherOn[q.questionId] && (
                              <input
                                className="ap-input"
                                placeholder={t("otherPlaceholder")}
                                value={otherText[q.questionId] ?? ""}
                                onChange={(e) => setOtherTextFor(q.questionId, e.target.value)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="ap-err">{error}</p>}

          <div className="ap-foot">
            <Link className="btn btn-ghost" href="/hackathons">
              {t("cancel")}
            </Link>
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={submitting || questions === null}
            >
              <Icon name="check" /> {submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

export default ApplyHackathonClient;
