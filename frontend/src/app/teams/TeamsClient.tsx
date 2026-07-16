"use client";

/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { CreateTeamPopup } from "@/components/popups/CreateTeamPopup";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import { TeamDetailPopup } from "@/components/popups/TeamDetailPopup";
import {
  AV_POS,
  AvatarStack,
  OpenTeamCard,
  SoloPlayerCard,
  InviteCard,
  type SoloPlayerCardPlayer,
} from "@/components/teams";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import type {
  Team,
  OpenTeam,
  TeamInvitation,
  TeamJoinRequest,
  Project,
  TeammateSuggestion,
  TeamSuggestion,
} from "@/lib/api";

/**
 * TeamsClient — interactive /teams page.
 *
 * Live data:
 *   - "My teams"      → api.getMyTeams()
 *   - "Invites"       → api.getMyInvitations()  (Accept → api.acceptInvitation,
 *                       Decline → api.declineInvitation; badge = invitations.length)
 *   - "AI suggestions" → api.getTeamSuggestions(hackathonId), called once per team the
 *                       caller belongs to (each hackathon scores suggestions against
 *                       "my team in that hackathon" server-side) — rendered as one
 *                       "For team X" group per team, plus ranked open teams to join
 *                       (api.getMyActiveHackathon()-scoped) for callers with no team yet.
 *   - "Create team"   → CreateTeamPopup → api.createTeam(name, hackathonId), which also
 *                       invites every other participant of that hackathon server-side —
 *                       no separate "browse open teams / free agents" flow needed.
 *
 * Behaviour:
 *   - Tab filter: updates data-filter on the <main> element so the co-located
 *     CSS hides/shows sections (.tm-page[data-filter="X"] .tm-section:not([data-section="X"])).
 *     "suggested" has no pill in the tablist — only the "AI suggestions" button (above
 *     the tabs row) switches into it, same mechanism as handleTabClick.
 *   - "Create team" opens <CreateTeamPopup />.
 *   - "Invite to team" on a suggested teammate invites into that specific team's roster
 *     (the group it was suggested under) — the whole suggested-teammates block is omitted
 *     for a caller with no teams at all, since there's no team to invite into.
 * Supplies its own `<main className="tm-page" id="main">`.
 */

const M = {
  back: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Teams", sr: "Timovi" },
  pageSub: { en: "Teammates for the next hackathon.", sr: "Saigrači za naredni hackathon." },
  tablistLabel: { en: "Filter teams", sr: "Filter timova" },
  tabMine: { en: "My teams", sr: "Moji timovi" },
  tabInvites: { en: "Invites", sr: "Pozivi" },
  createTeam: { en: "Create team", sr: "Kreiraj tim" },
  aiSuggestions: { en: "AI suggestions", sr: "AI predlozi" },
  sectionMine: { en: "My teams", sr: "Moji timovi" },
  members: { en: "members", sr: "člana" },
  tasks: { en: "tasks", sr: "taskova" },
  openServer: { en: "Open server", sr: "Otvori server" },
  sectionInvites: { en: "Invites", sr: "Pozivnice" },
  invitesHeadline: {
    en: "Teams inviting you to join.",
    sr: "Timovi koji te pozivaju da im se pridružiš.",
  },
  acceptInvite: { en: "Accept invite", sr: "Prihvati poziv" },
  declineInvite: { en: "Decline", sr: "Odbij" },
  accepting: { en: "Accepting…", sr: "Prihvatam…" },
  declining: { en: "Declining…", sr: "Odbijam…" },
  emptyInvites: { en: "No invites right now.", sr: "Trenutno nema poziva." },
  lookingFor: { en: "Looking for", sr: "Traže" },
  requestJoin: { en: "Request to join", sr: "Zatraži priključenje" },
  requested: { en: "Requested", sr: "Zatraženo" },
  inviteToTeam: { en: "Invite to team", sr: "Pozovi u tim" },
  invited: { en: "Invited", sr: "Pozvan" },
  inviting: { en: "Inviting…", sr: "Pozivam…" },
  sectionSuggested: { en: "Suggested teammates", sr: "Predloženi saigrači" },
  suggestedHeadline: {
    en: "Free agents ranked by how well they'd complement your skills.",
    sr: "Slobodni igrači rangirani po tome koliko dopunjuju tvoje veštine.",
  },
  forTeam: { en: "For team", sr: "Za tim" },
  sectionSuggestedTeams: { en: "Suggested teams", sr: "Predloženi timovi" },
  suggestedTeamsHeadline: {
    en: "Open teams ranked by how well you'd complement them.",
    sr: "Otvoreni timovi rangirani po tome koliko bi ih ti dopunio/la.",
  },
  emptySuggestedNoHackathon: {
    en: "Join a hackathon to see personalized teammate suggestions.",
    sr: "Prijavi se na hakaton da vidiš personalizovane predloge saigrača.",
  },
  emptySuggested: { en: "No suggestions right now.", sr: "Trenutno nema predloga." },
  emptySuggestedTeams: {
    en: "No suggested teams right now.",
    sr: "Trenutno nema predloženih timova.",
  },
  youLabel: { en: "you", sr: "ti" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  emptyMine: { en: "You're not in any team yet.", sr: "Još nisi ni u jednom timu." },
  joining: { en: "Sending…", sr: "Šaljem…" },
  addProject: { en: "Add project", sr: "Dodaj projekat" },
  editDraft: { en: "Edit draft", sr: "Uredi nacrt" },
  submittedLabel: { en: "Submitted ✓", sr: "Predato ✓" },
  projectLabel: { en: "Project", sr: "Projekat" },
  appPending: {
    en: "Pending organizer approval",
    sr: "Čeka odobrenje organizatora",
  },
  appRejected: { en: "Application rejected", sr: "Prijava odbijena" },
  // Incoming join requests (leader side)
  joinReqTitle: { en: "Join requests", sr: "Zahtevi za pridruživanje" },
  joinReqWantsTo: { en: "wants to join", sr: "želi da se pridruži" },
  joinReqAccept: { en: "Accept", sr: "Prihvati" },
  joinReqDecline: { en: "Decline", sr: "Odbij" },
} as const;

type Filter = "mine" | "invites" | "suggested";

export function TeamsClient() {
  const router = useRouter();
  const { user } = useRequireAuth();
  const t = useT(M);

  const [filter, setFilter] = useState<Filter>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  // Username whose profile popup is open (null = closed).
  const [popupUser, setPopupUser] = useState<string | null>(null);
  // Team whose roster popup is open (null = closed).
  const [detailTeam, setDetailTeam] = useState<Team | null>(null);

  // Live data
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  // Suggested teammates per team the caller belongs to, keyed by teamId.
  const [suggestionsByTeam, setSuggestionsByTeam] = useState<Record<string, TeammateSuggestion[]>>(
    {},
  );
  const [suggestedTeams, setSuggestedTeams] = useState<TeamSuggestion[]>([]);
  const [hasActiveHackathon, setHasActiveHackathon] = useState(false);
  const [loading, setLoading] = useState(true);

  // Per-action busy / optimistic tracking, keyed by id.
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [requestedTeamIds, setRequestedTeamIds] = useState<Set<string>>(new Set());
  // Keyed by "teamId:userId" — the same free agent can be suggested under
  // more than one "For team X" group, so invite state must not leak across teams.
  const [invitingKey, setInvitingKey] = useState<string | null>(null);
  const [invitedKeys, setInvitedKeys] = useState<Set<string>>(new Set());
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);
  // The caller's project per team (drives the "Add project"/"Edit draft"/"Submitted" label).
  const [projectsByTeam, setProjectsByTeam] = useState<Record<string, Project | null>>({});
  // Pending join requests per team the caller leads + per-request busy flag.
  const [joinRequestsByTeam, setJoinRequestsByTeam] = useState<Record<string, TeamJoinRequest[]>>(
    {},
  );
  const [joinReqBusyId, setJoinReqBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [mine, invites, activeHackathon] = await Promise.all([
        api.getMyTeams(),
        api.getMyInvitations(),
        api.getMyActiveHackathon().catch(() => null),
      ]);
      setMyTeams(mine);
      setInvitations(invites);
      setHasActiveHackathon(activeHackathon !== null);

      // "For team X" suggestions — one lookup per team the caller belongs to.
      // Each hackathon's endpoint scores against "my team in that hackathon"
      // server-side (a user has at most one active team per hackathon), so
      // this naturally yields suggestions specific to each team.
      const perTeam = await Promise.all(
        mine.map((team) =>
          api
            .getTeamSuggestions(team.hackathonId)
            .then((s) => ({ hackathonId: team.hackathonId, suggestions: s }))
            .catch(() => ({ hackathonId: team.hackathonId, suggestions: null })),
        ),
      );
      setSuggestionsByTeam(
        Object.fromEntries(
          mine.map((team, i) => [team.teamId, perTeam[i].suggestions?.teammates ?? []]),
        ),
      );

      // Open-team suggestions (for a caller with no team in their active
      // hackathon) — reuse a per-team lookup above when it already covered
      // that hackathon, otherwise fetch it once more.
      const reused = perTeam.find((f) => f.hackathonId === activeHackathon?.hackathonId);
      const openSuggestions = !activeHackathon
        ? null
        : (reused?.suggestions ??
          (await api.getTeamSuggestions(activeHackathon.hackathonId).catch(() => null)));
      setSuggestedTeams(openSuggestions?.teams ?? []);
    } catch (err) {
      console.error("Failed to load teams data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Load each of my teams' project status (card label + popup preload).
  useEffect(() => {
    if (myTeams.length === 0) return;
    let cancelled = false;
    void Promise.all(
      myTeams.map((tm) =>
        api
          .getTeamProject(tm.teamId)
          .then((p) => [tm.teamId, p] as const)
          .catch(() => [tm.teamId, null] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setProjectsByTeam(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [myTeams]);

  const projectBtnLabel = (p: Project | null | undefined): string => {
    if (!p) return t("addProject");
    if (p.status === "draft") return t("editDraft");
    if (p.status === "submitted") return t("submittedLabel");
    return t("projectLabel");
  };

  // Teams the caller leads may have pending join requests to approve; the
  // backend gates listing on leadership, so only fetch for those.
  const leadsTeam = useCallback(
    (team: Team) => team.members.some((m) => m.userId === user?.userId && m.role === "leader"),
    [user?.userId],
  );

  useEffect(() => {
    const led = myTeams.filter(leadsTeam);
    if (led.length === 0) return;
    let cancelled = false;
    void Promise.all(
      led.map((tm) =>
        api
          .getTeamJoinRequests(tm.teamId)
          .then((reqs) => [tm.teamId, reqs] as const)
          .catch(() => [tm.teamId, [] as TeamJoinRequest[]] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setJoinRequestsByTeam(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [myTeams, leadsTeam]);

  // Leader accepts a join request → member joins; refresh that team's requests
  // and my teams (member count changes). Optimistically drop the row.
  const handleAcceptJoinRequest = async (req: TeamJoinRequest) => {
    setJoinReqBusyId(req.requestId);
    try {
      await api.acceptJoinRequest(req.requestId);
      const [reqs, mine] = await Promise.all([
        api.getTeamJoinRequests(req.teamId),
        api.getMyTeams(),
      ]);
      setJoinRequestsByTeam((prev) => ({ ...prev, [req.teamId]: reqs }));
      setMyTeams(mine);
    } catch (err) {
      console.error("Failed to accept join request", err);
    } finally {
      setJoinReqBusyId(null);
    }
  };

  // Leader declines a join request → refresh that team's requests.
  const handleDeclineJoinRequest = async (req: TeamJoinRequest) => {
    setJoinReqBusyId(req.requestId);
    try {
      await api.declineJoinRequest(req.requestId);
      const reqs = await api.getTeamJoinRequests(req.teamId);
      setJoinRequestsByTeam((prev) => ({ ...prev, [req.teamId]: reqs }));
    } catch (err) {
      console.error("Failed to decline join request", err);
    } finally {
      setJoinReqBusyId(null);
    }
  };

  const handleTabClick = (f: Filter) => {
    setFilter(f);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Request to join an open team. Optimistically mark the card as "Requested"
  // (disabled) and revert that flag on failure.
  const handleRequestJoin = async (team: OpenTeam) => {
    setJoiningId(team.teamId);
    try {
      await api.requestToJoinTeam(team.teamId);
      setRequestedTeamIds((prev) => new Set(prev).add(team.teamId));
    } catch (err) {
      console.error("Failed to request to join team", err);
    } finally {
      setJoiningId(null);
    }
  };

  // Accept a team invitation → join the team, then refresh invites + my teams.
  const handleAcceptInvite = async (inv: TeamInvitation) => {
    setInvitationBusyId(inv.invitationId);
    try {
      await api.acceptInvitation(inv.invitationId);
      const [invites, mine] = await Promise.all([api.getMyInvitations(), api.getMyTeams()]);
      setInvitations(invites);
      setMyTeams(mine);
    } catch (err) {
      console.error("Failed to accept invitation", err);
    } finally {
      setInvitationBusyId(null);
    }
  };

  // Decline a team invitation → drop it, refresh invites.
  const handleDeclineInvite = async (inv: TeamInvitation) => {
    setInvitationBusyId(inv.invitationId);
    try {
      await api.declineInvitation(inv.invitationId);
      const invites = await api.getMyInvitations();
      setInvitations(invites);
    } catch (err) {
      console.error("Failed to decline invitation", err);
    } finally {
      setInvitationBusyId(null);
    }
  };

  // Invite a free agent into a specific team (the "For team X" group the
  // suggestion appeared under). Optimistically mark "Invited"; revert on
  // failure.
  const handleInviteSolo = async (player: SoloPlayerCardPlayer, team: Team) => {
    const key = `${team.teamId}:${player.userId}`;
    setInvitingKey(key);
    try {
      await api.inviteToTeam(team.teamId, player.userId);
      setInvitedKeys((prev) => new Set(prev).add(key));
    } catch (err) {
      console.error("Failed to invite player to team", err);
    } finally {
      setInvitingKey(null);
    }
  };

  return (
    <>
      <AppShell right={<RailRight />}>
        <main className="tm-page" id="main" data-filter={filter}>
          {/* Page header */}
          <div className="page-head tm-headrow">
            <button
              type="button"
              className="col-back"
              aria-label={t("back")}
              onClick={() => router.back()}
            >
              <Icon name="arrow-left" />
            </button>
            <div className="col-titles">
              <h1 className="page-title">
                <Icon name="teams" /> {t("pageTitle")}
              </h1>
              <p className="page-sub">{t("pageSub")}</p>
            </div>
          </div>

          {/* Actions row — sits above the tab divider; AI suggestions on the far
              left, Create team on the far right. */}
          <div className="tm-actions-row">
            <button
              type="button"
              className={`btn btn-ghost${filter === "suggested" ? " tm-action-active" : ""}`}
              onClick={() => handleTabClick("suggested")}
            >
              <Icon name="sparkles" /> {t("aiSuggestions")}
            </button>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" /> {t("createTeam")}
            </button>
          </div>

          {/* Tabs */}
          <div className="tabs-row tabs-row--divided">
            <div className="tm-tabs" role="tablist" aria-label={t("tablistLabel")}>
              <button
                className={`tm-tab${filter === "mine" ? " tm-tab-active" : ""}`}
                data-filter="mine"
                role="tab"
                aria-selected={filter === "mine"}
                onClick={() => handleTabClick("mine")}
              >
                {t("tabMine")}
              </button>
              <button
                className={`tm-tab${filter === "invites" ? " tm-tab-active" : ""}`}
                data-filter="invites"
                role="tab"
                aria-selected={filter === "invites"}
                onClick={() => handleTabClick("invites")}
              >
                {t("tabInvites")} <span className="tm-tab-count">{invitations.length}</span>
              </button>
            </div>
          </div>

          {/* MOJ TIM */}
          <section className="tm-section" data-section="mine" aria-label={t("sectionMine")}>
            <div className="tm-mine-grid">
              {loading ? (
                [0, 1].map((i) => (
                  <article key={`tm-skel-${i}`} className="tm-team-card" aria-busy="true">
                    <div className="tm-tc-avs" aria-hidden="true">
                      {[0, 1, 2].map((j) => (
                        <div
                          key={j}
                          className={`tm-av ${AV_POS[j % AV_POS.length]} tm-av-md is-orb skel skel-circle`}
                        />
                      ))}
                    </div>
                    <div className="tm-tc-body" aria-hidden="true">
                      <span
                        className="skel skel-line"
                        style={{ width: "55%", height: 18 } as React.CSSProperties}
                      />
                      <span
                        className="skel skel-line"
                        style={{ width: "45%", marginTop: 7 } as React.CSSProperties}
                      />
                      <span
                        className="skel skel-line"
                        style={{ width: "35%", marginTop: 7 } as React.CSSProperties}
                      />
                    </div>
                    <div className="tm-tc-side" aria-hidden="true">
                      <div className="tm-tc-actions">
                        <span
                          className="skel"
                          style={
                            { width: 116, height: 36, borderRadius: 10 } as React.CSSProperties
                          }
                        />
                        <span
                          className="skel"
                          style={{ width: 80, height: 36, borderRadius: 10 } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </article>
                ))
              ) : myTeams.length === 0 ? (
                <p className="page-sub">{t("emptyMine")}</p>
              ) : (
                myTeams.map((team) => {
                  const ended = team.status === "ended" || team.status === "completed";
                  const live = team.status === "active" || team.status === "live";
                  const cls = ended
                    ? "tm-team-card tm-team-card--ended"
                    : live
                      ? "tm-team-card tm-team-card--live"
                      : "tm-team-card";
                  return (
                    <article key={team.teamId} className={cls}>
                      <AvatarStack
                        className="tm-tc-avs"
                        members={team.members}
                        size="md"
                        meId={user?.userId}
                        onOpenProfile={setPopupUser}
                      />
                      <div className="tm-tc-body">
                        <button
                          type="button"
                          className="tm-tc-name tm-tc-name-btn"
                          onClick={() => setDetailTeam(team)}
                        >
                          {team.name}
                        </button>
                        <div className="tm-tc-for">
                          <Icon name="hackathon" /> {team.hackathonTitle}
                        </div>
                        <div className="tm-tc-meta">
                          <span className="tnum">{team.memberCount}</span> {t("members")} ·{" "}
                          <span className="tnum">{team.totalXp}</span> XP
                        </div>
                        {team.applicationStatus === "pending" && (
                          <div className="tm-tc-appbadge tm-tc-appbadge--pending">
                            <Icon name="clock" /> {t("appPending")}
                          </div>
                        )}
                        {team.applicationStatus === "rejected" && (
                          <div className="tm-tc-appbadge tm-tc-appbadge--rejected">
                            <Icon name="x" /> {t("appRejected")}
                          </div>
                        )}
                        {/* Leader-only: pending join requests to approve/decline. */}
                        {(joinRequestsByTeam[team.teamId]?.length ?? 0) > 0 && (
                          <div className="tm-joinreqs">
                            <div className="tm-joinreqs-title">
                              <Icon name="teams" className="ic-sm" /> {t("joinReqTitle")}
                              <span className="tm-tab-count">
                                {joinRequestsByTeam[team.teamId].length}
                              </span>
                            </div>
                            {joinRequestsByTeam[team.teamId].map((req) => (
                              <div key={req.requestId} className="tm-joinreq">
                                <div className="tm-joinreq-info">
                                  <button
                                    type="button"
                                    className="tm-joinreq-name"
                                    onClick={() => setPopupUser(req.username)}
                                  >
                                    {req.displayName || req.username}
                                  </button>
                                  <span className="tm-joinreq-sub">
                                    {" "}
                                    {t("joinReqWantsTo")}
                                    {req.message ? <> · “{req.message}”</> : null}
                                  </span>
                                </div>
                                <div className="tm-joinreq-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={joinReqBusyId === req.requestId}
                                    onClick={() => handleAcceptJoinRequest(req)}
                                  >
                                    <Icon name="check" className="ic-sm" /> {t("joinReqAccept")}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={joinReqBusyId === req.requestId}
                                    onClick={() => handleDeclineJoinRequest(req)}
                                  >
                                    <Icon name="x" className="ic-sm" /> {t("joinReqDecline")}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="tm-tc-side">
                        <div className="tm-tc-actions">
                          {/* "Open server" → this team's hackathon server in Cohor,
                              deep-linked so it opens even if it isn't the user's
                              "active" hackathon (e.g. it already ended).
                              Locked until the organizer approves the hackathon application. */}
                          {team.applicationStatus === "pending" ? (
                            <button className="btn btn-violet" disabled>
                              <Icon name="server" /> {t("openServer")}
                            </button>
                          ) : (
                            <Link
                              className="btn btn-violet"
                              href={team.serverId ? `/cohor?server=${team.serverId}` : "/cohor"}
                            >
                              <Icon name="server" /> {t("openServer")}
                            </Link>
                          )}
                          {/* "Project" → create / edit / submit the team's
                              hackathon deliverable, in the hackathon's own
                              Cohor server (#predaja-projekta) rather than a
                              separate popup. */}
                          {team.applicationStatus === "pending" ? (
                            <button className="btn btn-ghost" disabled>
                              <Icon name="rocket" /> {projectBtnLabel(projectsByTeam[team.teamId])}
                            </button>
                          ) : (
                            <Link
                              className="btn btn-ghost"
                              href={
                                team.serverId
                                  ? `/cohor?server=${team.serverId}&channel=predaja-projekta`
                                  : "/cohor"
                              }
                            >
                              <Icon name="rocket" /> {projectBtnLabel(projectsByTeam[team.teamId])}
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {/* POZIVI / INVITES */}
          <section className="tm-section" data-section="invites" aria-label={t("sectionInvites")}>
            <div className="tm-ai-head">
              <div>
                <div className="tm-ai-eyebrow">
                  <Icon name="teams" /> {t("sectionInvites")}
                </div>
                <h2 className="tm-ai-h">{t("invitesHeadline")}</h2>
              </div>
            </div>

            <div className="tm-sug-grid">
              {loading ? (
                [0, 1].map((i) => (
                  <div key={`tm-sug-skel-${i}`} className="tm-sug" aria-busy="true">
                    <div className="tm-sug-body" aria-hidden="true">
                      <span
                        className="skel skel-line"
                        style={{ width: "70%" } as React.CSSProperties}
                      />
                      <div className="tm-sug-avs" style={{ marginTop: 9 } as React.CSSProperties}>
                        {[0, 1, 2].map((j) => (
                          <div
                            key={j}
                            className={`tm-av ${AV_POS[j % AV_POS.length]} tm-av-md is-orb skel skel-circle`}
                          />
                        ))}
                      </div>
                      <span
                        className="skel skel-line"
                        style={{ width: "50%", marginTop: 9 } as React.CSSProperties}
                      />
                      <span
                        className="skel skel-line"
                        style={{ width: "92%", marginTop: 6 } as React.CSSProperties}
                      />
                      <span
                        className="skel skel-line"
                        style={{ width: "68%", marginTop: 6 } as React.CSSProperties}
                      />
                      <span
                        className="skel"
                        style={
                          {
                            width: 132,
                            height: 36,
                            borderRadius: 10,
                            marginTop: 14,
                            display: "block",
                          } as React.CSSProperties
                        }
                      />
                    </div>
                  </div>
                ))
              ) : invitations.length === 0 ? (
                <p className="page-sub">{t("emptyInvites")}</p>
              ) : (
                invitations.map((inv) => (
                  <InviteCard
                    key={inv.invitationId}
                    invite={inv}
                    busy={invitationBusyId === inv.invitationId}
                    meSeed={user?.username ?? "you"}
                    onAccept={handleAcceptInvite}
                    onDecline={handleDeclineInvite}
                    labels={{
                      you: t("youLabel"),
                      acceptInvite: t("acceptInvite"),
                      decline: t("declineInvite"),
                      accepting: t("accepting"),
                      declining: t("declining"),
                      fallbackWhy: t("invitesHeadline"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* PREDLOŽENI SAIGRAČI / AI SUGGESTIONS — one "For team X" group per
              team the caller belongs to; the whole block is omitted for a
              caller with no teams (nothing to invite into). */}
          {(loading || myTeams.length > 0) && (
            <section
              className="tm-section"
              data-section="suggested"
              aria-label={t("sectionSuggested")}
            >
              <div className="tm-ai-head">
                <div>
                  <div className="tm-ai-eyebrow">
                    <Icon name="sparkles" /> {t("sectionSuggested")}
                  </div>
                  <h2 className="tm-ai-h">{t("suggestedHeadline")}</h2>
                </div>
              </div>

              {loading ? (
                <p className="page-sub">{t("loading")}</p>
              ) : (
                myTeams.map((team) => {
                  const teammates = suggestionsByTeam[team.teamId] ?? [];
                  return (
                    <div key={team.teamId} className="tm-suggested-team-group">
                      <h3 className="tm-suggested-team-title">
                        {t("forTeam")} {team.name}:
                      </h3>
                      <div className="tm-solo-grid">
                        {teammates.length === 0 ? (
                          <p className="page-sub">{t("emptySuggested")}</p>
                        ) : (
                          teammates.map((player, i) => {
                            const key = `${team.teamId}:${player.userId}`;
                            return (
                              <SoloPlayerCard
                                key={key}
                                player={player}
                                index={i}
                                invited={invitedKeys.has(key)}
                                sending={invitingKey === key}
                                onInvite={(p) => handleInviteSolo(p, team)}
                                onOpenProfile={setPopupUser}
                                actionIcon
                                score={player.score}
                                labels={{
                                  inviteToTeam: t("inviteToTeam"),
                                  invited: t("invited"),
                                  inviting: t("inviting"),
                                }}
                              />
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          )}

          {/* PREDLOŽENI TIMOVI / OPEN TEAMS TO JOIN — stays visible even when
              the caller has no teams, since this is how a team-less user
              finds one; same "suggested" filter/section as the block above. */}
          <section
            className="tm-section"
            data-section="suggested"
            aria-label={t("sectionSuggestedTeams")}
          >
            <div className="tm-ai-head">
              <div>
                <div className="tm-ai-eyebrow">
                  <Icon name="teams" /> {t("sectionSuggestedTeams")}
                </div>
                <h2 className="tm-ai-h">{t("suggestedTeamsHeadline")}</h2>
              </div>
            </div>

            <div className="tm-open-grid">
              {loading ? (
                <p className="page-sub">{t("loading")}</p>
              ) : !hasActiveHackathon ? (
                <p className="page-sub">{t("emptySuggestedNoHackathon")}</p>
              ) : suggestedTeams.length === 0 ? (
                <p className="page-sub">{t("emptySuggestedTeams")}</p>
              ) : (
                suggestedTeams.map((team) => (
                  <OpenTeamCard
                    key={team.teamId}
                    team={team}
                    requested={requestedTeamIds.has(team.teamId)}
                    sending={joiningId === team.teamId}
                    onRequest={handleRequestJoin}
                    hackIcon
                    slotIcon
                    score={team.score}
                    labels={{
                      lookingFor: t("lookingFor"),
                      members: t("members"),
                      requestJoin: t("requestJoin"),
                      requested: t("requested"),
                      joining: t("joining"),
                    }}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      </AppShell>

      {/* Modals (rendered outside AppShell so they're truly full-screen) */}
      <CreateTeamPopup
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          void loadAll();
        }}
      />
      <ProfilePopup
        open={popupUser !== null}
        username={popupUser}
        onClose={() => setPopupUser(null)}
      />
      <TeamDetailPopup
        open={detailTeam !== null}
        team={detailTeam}
        onClose={() => setDetailTeam(null)}
        onOpenProfile={setPopupUser}
        meId={user?.userId}
      />
    </>
  );
}

export default TeamsClient;
