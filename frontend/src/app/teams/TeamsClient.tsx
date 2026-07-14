"use client";

/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { CreateTeamPopup } from "@/components/popups/CreateTeamPopup";
import { JoinTeamPopup } from "@/components/popups/JoinTeamPopup";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import {
  AV_POS,
  AvatarStack,
  OpenTeamCard,
  SoloPlayerCard,
  InviteCard,
  TeamLeaderboardRow,
  type SoloPlayerCardPlayer,
} from "@/components/teams";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import type {
  Team,
  OpenTeam,
  SoloPlayer,
  LeaderboardEntry,
  TeamInvitation,
  Project,
} from "@/lib/api";

/**
 * TeamsClient — interactive /teams page.
 *
 * Live data:
 *   - "My teams"      → api.getMyTeams()
 *   - "Invites"       → api.getMyInvitations()  (Accept → api.acceptInvitation,
 *                       Decline → api.declineInvitation; badge = invitations.length)
 *   - "Open teams"    → api.getOpenTeams()  ("Request to join" → api.requestToJoinTeam)
 *   - "Free agents"   → api.getSoloPlayers()  ("Invite to team" →
 *                       api.inviteToTeam(myTeams[0].teamId, userId) when the caller
 *                       has a team; otherwise opens JoinTeamPopup)
 *   - "Team leaderboard" → api.getTeamLeaderboard()
 *   - "Create team"   → CreateTeamPopup → api.createTeam(name, hackathonId)
 *
 * Behaviour:
 *   - Tab filter: updates data-filter on the <main> element so the co-located
 *     CSS hides/shows sections (.tm-page[data-filter="X"] .tm-section:not([data-section="X"])).
 *   - "Create team" opens <CreateTeamPopup />.
 *   - "Invite to team" buttons (free agents) open <JoinTeamPopup /> with the
 *     agent's username as the teamName prop (invite framing).
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
  sectionMine: { en: "My teams", sr: "Moji timovi" },
  members: { en: "members", sr: "člana" },
  tasks: { en: "tasks", sr: "taskova" },
  openServer: { en: "Open server", sr: "Otvori server" },
  place: { en: "place", sr: "mesto" },
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
  sectionOpen: { en: "Open teams", sr: "Otvoreni timovi" },
  openBadge: { en: "Open", sr: "Otvoren" },
  lookingFor: { en: "Looking for", sr: "Traže" },
  requestJoin: { en: "Request to join", sr: "Zatraži priključenje" },
  requested: { en: "Requested", sr: "Zatraženo" },
  sectionSolo: { en: "Free agents", sr: "Slobodni igrači" },
  inviteToTeam: { en: "Invite to team", sr: "Pozovi u tim" },
  invited: { en: "Invited", sr: "Pozvan" },
  inviting: { en: "Inviting…", sr: "Pozivam…" },
  sectionBoard: { en: "Team leaderboard", sr: "Leaderboard timova" },
  youLabel: { en: "you", sr: "ti" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  emptyMine: { en: "You're not in any team yet.", sr: "Još nisi ni u jednom timu." },
  emptyOpen: { en: "No open teams right now.", sr: "Trenutno nema otvorenih timova." },
  emptySolo: { en: "No free agents right now.", sr: "Trenutno nema slobodnih igrača." },
  emptyBoard: { en: "No ranked teams yet.", sr: "Još nema rangiranih timova." },
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
} as const;

type Filter = "mine" | "invites" | "open" | "solo" | "board";

export function TeamsClient() {
  const { user } = useRequireAuth();
  const t = useT(M);

  const [filter, setFilter] = useState<Filter>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<string | null>(null);
  // Username whose profile popup is open (null = closed).
  const [popupUser, setPopupUser] = useState<string | null>(null);

  // Live data
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [openTeams, setOpenTeams] = useState<OpenTeam[]>([]);
  const [soloPlayers, setSoloPlayers] = useState<SoloPlayer[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-action busy / optimistic tracking, keyed by id.
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [requestedTeamIds, setRequestedTeamIds] = useState<Set<string>>(new Set());
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);
  // The caller's project per team (drives the "Add project"/"Edit draft"/"Submitted" label).
  const [projectsByTeam, setProjectsByTeam] = useState<Record<string, Project | null>>({});

  const loadAll = useCallback(async () => {
    try {
      const [mine, open, solo, board, invites] = await Promise.all([
        api.getMyTeams(),
        api.getOpenTeams(),
        api.getSoloPlayers(),
        api.getTeamLeaderboard(),
        api.getMyInvitations(),
      ]);
      setMyTeams(mine);
      setOpenTeams(open);
      setSoloPlayers(solo);
      setLeaderboard(board);
      setInvitations(invites);
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

  // Use the first team as the "inviting" team — handling multiple teams per user
  // (selecting which one to invite from) is not yet implemented.
  const myTeam = myTeams[0] ?? null;

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

  // Invite a free agent into the caller's primary team. Optimistically mark
  // "Invited"; revert on failure. Callers without a team open JoinTeamPopup.
  const handleInviteSolo = async (player: SoloPlayerCardPlayer) => {
    if (!myTeam) {
      // No team yet: open JoinTeamPopup as a workaround — there is no inviteToTeam
      // endpoint to call without a real teamId, so we capture the intent instead.
      setJoinTarget(player.username);
      return;
    }
    setInvitingUserId(player.userId);
    try {
      await api.inviteToTeam(myTeam.teamId, player.userId);
      setInvitedUserIds((prev) => new Set(prev).add(player.userId));
    } catch (err) {
      console.error("Failed to invite player to team", err);
    } finally {
      setInvitingUserId(null);
    }
  };

  return (
    <>
      <AppShell right={<RailRight />}>
        <main className="tm-page" id="main" data-filter={filter}>
          {/* Page header */}
          <div className="page-head tm-headrow">
            <Link className="col-back" href="/" aria-label={t("back")}>
              <Icon name="arrow-left" />
            </Link>
            <div className="col-titles">
              <h1 className="page-title">
                <Icon name="teams" /> {t("pageTitle")}
              </h1>
              <p className="page-sub">{t("pageSub")}</p>
            </div>
          </div>

          {/* Tabs + create action */}
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
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" /> {t("createTeam")}
            </button>
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
                        <h2 className="tm-tc-name">{team.name}</h2>
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

          {/* OTVORENI TIMOVI */}
          <section className="tm-section" data-section="open" aria-label={t("sectionOpen")}>
            <div className="tm-open-grid">
              {loading ? (
                <p className="page-sub">{t("loading")}</p>
              ) : openTeams.length === 0 ? (
                <p className="page-sub">{t("emptyOpen")}</p>
              ) : (
                openTeams.map((team) => (
                  <OpenTeamCard
                    key={team.teamId}
                    team={team}
                    requested={requestedTeamIds.has(team.teamId)}
                    sending={joiningId === team.teamId}
                    onRequest={handleRequestJoin}
                    showBadge
                    labels={{
                      openBadge: t("openBadge"),
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

          {/* SLOBODNI IGRAČI */}
          <section className="tm-section" data-section="solo" aria-label={t("sectionSolo")}>
            <div className="tm-solo-grid">
              {loading ? (
                <p className="page-sub">{t("loading")}</p>
              ) : soloPlayers.length === 0 ? (
                <p className="page-sub">{t("emptySolo")}</p>
              ) : (
                soloPlayers.map((player, i) => (
                  <SoloPlayerCard
                    key={player.userId}
                    player={player}
                    index={i}
                    invited={invitedUserIds.has(player.userId)}
                    sending={invitingUserId === player.userId}
                    onInvite={handleInviteSolo}
                    onOpenProfile={setPopupUser}
                    actionIcon
                    labels={{
                      inviteToTeam: t("inviteToTeam"),
                      invited: t("invited"),
                      inviting: t("inviting"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* LEADERBOARD */}
          <section className="tm-section" data-section="board" aria-label={t("sectionBoard")}>
            <div className="tm-lb">
              {loading ? (
                <p className="page-sub">{t("loading")}</p>
              ) : leaderboard.length === 0 ? (
                <p className="page-sub">{t("emptyBoard")}</p>
              ) : (
                leaderboard.map((entry) => (
                  <TeamLeaderboardRow
                    key={entry.teamId}
                    entry={entry}
                    isYou={entry.members.some((m) => m.userId === user?.userId)}
                    pixelFont
                    xpMarker="spark"
                    youLabel={t("youLabel")}
                    onOpenProfile={setPopupUser}
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
      {/* Opened when a team-less user taps "Invite to team" on a free agent:
          there is no team to invite into yet, so we collect an intro message.
          onSubmit is wired; without a team id
          there is no invite endpoint to hit, so we record the intent and close
          rather than fake a successful request. */}
      <JoinTeamPopup
        open={joinTarget !== null}
        teamName={joinTarget ?? ""}
        onClose={() => setJoinTarget(null)}
        onSubmit={(message) => {
          console.info("Join-team message captured for", joinTarget, message);
        }}
      />
      <ProfilePopup
        open={popupUser !== null}
        username={popupUser}
        onClose={() => setPopupUser(null)}
      />
    </>
  );
}

export default TeamsClient;
