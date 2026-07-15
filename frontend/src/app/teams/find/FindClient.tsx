"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { CreateTeamPopup } from "@/components/popups/CreateTeamPopup";
import { JoinTeamPopup } from "@/components/popups/JoinTeamPopup";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import {
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
  OpenTeam,
  SoloPlayer,
  TeammateSuggestion,
  TeamSuggestion,
  LeaderboardEntry,
  TeamInvitation,
  Team,
} from "@/lib/api";

/**
 * FindClient — interactive /teams/find page.
 *
 * Live data:
 *   - "Invites"        → api.getMyInvitations()  (accept → api.acceptInvitation,
 *                        decline → api.declineInvitation); badge → api.getInvitationCount()
 *   - "Suggested"      → api.getMyActiveHackathon() then api.getTeamSuggestions(id)
 *                        — ranked teammates AND ranked open teams to join
 *                        ("Request to join" → api.requestToJoinTeam), both by
 *                        skill complementarity; falls back to an empty state
 *                        when the caller has no active hackathon
 *   - "Open teams"     → api.getOpenTeams()  ("Request to join" → api.requestToJoinTeam)
 *   - "Free agents"    → api.getSoloPlayers() ("Invite to team" → api.inviteToTeam,
 *                        targeting the caller's first team from api.getMyTeams())
 *   - "Top teams"      → api.getTeamLeaderboard()
 *   - "Create team"    → CreateTeamPopup (reloads on close)
 *
 * Behaviour:
 *   - Tab filter: clicking a tab updates data-filter on .tm-page which CSS uses
 *     to show/hide sections.
 *   - "Create team" buttons open <CreateTeamPopup/>.
 *   - "Invite to team" buttons (free agents/suggestions) open <JoinTeamPopup/>
 *     (invite framing).
 *   - "View invites" CTA switches the tab to "invites".
 *
 * Supplies its own <main className="tm-page" id="tm-main">.
 *
 * Autor: Nenad Skoković (2023/0039)
 */

const M = {
  back: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Teams", sr: "Timovi" },
  pageSub: { en: "Teammates for the next hackathon.", sr: "Saigrači za naredni hackathon." },
  tablistLabel: { en: "Filter teams", sr: "Filter timova" },
  tabMine: { en: "My teams", sr: "Moji timovi" },
  tabInvites: { en: "Invites", sr: "Pozivi" },
  tabSuggested: { en: "Suggested", sr: "Predlozi" },
  tabOpen: { en: "Open teams", sr: "Otvoreni timovi" },
  tabSolo: { en: "Free agents", sr: "Slobodni igrači" },
  tabBoard: { en: "Leaderboard", sr: "Rang lista" },
  createTeam: { en: "Create team", sr: "Kreiraj tim" },
  emptyTitle: { en: "You're not in a team yet", sr: "Nisi još u timu" },
  emptyDesc: {
    en: "Join an existing team, accept an invite, or create your own.",
    sr: "Pridruži se postojećem timu, prihvati poziv ili kreiraj sopstveni.",
  },
  viewInvites: { en: "View invites", sr: "Pogledaj pozive" },
  sectionInvites: { en: "Invites", sr: "Pozivnice" },
  invitesHeadline: {
    en: "Teams inviting you to join.",
    sr: "Timovi koji te pozivaju da im se pridružiš.",
  },
  acceptInvite: { en: "Accept invite", sr: "Prihvati poziv" },
  declineFind: { en: "Decline and find new suggestion", sr: "Odbij i traži nov predlog" },
  sectionSuggested: { en: "Suggested teammates", sr: "Predloženi saigrači" },
  suggestedHeadline: {
    en: "Free agents ranked by how well they'd complement your skills.",
    sr: "Slobodni igrači rangirani po tome koliko dopunjuju tvoje veštine.",
  },
  sectionSuggestedTeams: { en: "Suggested teams", sr: "Predloženi timovi" },
  suggestedTeamsHeadline: {
    en: "Open teams ranked by how well you'd complement them.",
    sr: "Otvoreni timovi rangirani po tome koliko bi ih ti dopunio/la.",
  },
  youLabel: { en: "you", sr: "ti" },
  lookingFor: { en: "Looking for", sr: "Traže" },
  members: { en: "members", sr: "člana" },
  requestJoin: { en: "Request to join", sr: "Zatraži priključenje" },
  requested: { en: "Requested", sr: "Zahtev poslat" },
  inviteToTeam: { en: "Invite to team", sr: "Pozovi u tim" },
  invited: { en: "Invited", sr: "Pozvan" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  emptyInvites: { en: "No invites right now.", sr: "Trenutno nema poziva." },
  emptyOpen: { en: "No open teams right now.", sr: "Trenutno nema otvorenih timova." },
  emptySolo: { en: "No free agents right now.", sr: "Trenutno nema slobodnih igrača." },
  emptyBoard: { en: "No ranked teams yet.", sr: "Još nema rangiranih timova." },
  emptySuggestedNoHackathon: {
    en: "Join a hackathon to see personalized teammate suggestions.",
    sr: "Prijavi se na hakaton da vidiš personalizovane predloge saigrača.",
  },
  emptySuggested: { en: "No suggestions right now.", sr: "Trenutno nema predloga." },
  emptySuggestedTeams: {
    en: "No suggested teams right now.",
    sr: "Trenutno nema predloženih timova.",
  },
} as const;

type Filter = "mine" | "invites" | "suggested" | "open" | "solo" | "board";

export function FindClient() {
  useRequireAuth();
  const t = useT(M);

  const [filter, setFilter] = useState<Filter>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<string | null>(null);
  // Username whose profile popup is open (null = closed).
  const [popupUser, setPopupUser] = useState<string | null>(null);

  // Live data
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [inviteCount, setInviteCount] = useState(0);
  const [openTeams, setOpenTeams] = useState<OpenTeam[]>([]);
  const [soloPlayers, setSoloPlayers] = useState<SoloPlayer[]>([]);
  const [suggestedTeammates, setSuggestedTeammates] = useState<TeammateSuggestion[]>([]);
  const [suggestedTeams, setSuggestedTeams] = useState<TeamSuggestion[]>([]);
  const [hasActiveHackathon, setHasActiveHackathon] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-action UI state.
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [requestedTeams, setRequestedTeams] = useState<Set<string>>(new Set());
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [invitedPlayers, setInvitedPlayers] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [invites, count, open, solo, board, mine, activeHackathon] = await Promise.all([
        api.getMyInvitations(),
        api.getInvitationCount(),
        api.getOpenTeams(),
        api.getSoloPlayers(),
        api.getTeamLeaderboard(),
        api.getMyTeams(),
        api.getMyActiveHackathon().catch(() => null),
      ]);
      setInvitations(invites);
      setInviteCount(count.count);
      setOpenTeams(open);
      setSoloPlayers(solo);
      setLeaderboard(board);
      setMyTeams(mine);
      setHasActiveHackathon(activeHackathon !== null);
      const suggestions = activeHackathon
        ? await api.getTeamSuggestions(activeHackathon.hackathonId).catch(() => null)
        : null;
      setSuggestedTeammates(suggestions?.teammates ?? []);
      setSuggestedTeams(suggestions?.teams ?? []);
    } catch (err) {
      console.error("Failed to load find-teams data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function switchTab(f: Filter) {
    setFilter(f);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Accept an invitation → join the team. Refresh on success.
  async function handleAcceptInvite(inv: TeamInvitation) {
    setBusyInvite(inv.invitationId);
    try {
      await api.acceptInvitation(inv.invitationId);
      await loadAll();
    } catch (err) {
      console.error("Failed to accept invitation", err);
    } finally {
      setBusyInvite(null);
    }
  }

  // Decline an invitation. Optimistically drop the card, refresh after.
  async function handleDeclineInvite(inv: TeamInvitation) {
    setBusyInvite(inv.invitationId);
    const prev = invitations;
    setInvitations((list) => list.filter((i) => i.invitationId !== inv.invitationId));
    try {
      await api.declineInvitation(inv.invitationId);
      await loadAll();
    } catch (err) {
      console.error("Failed to decline invitation", err);
      setInvitations(prev);
    } finally {
      setBusyInvite(null);
    }
  }

  // Request to join an open team. Optimistically mark "Requested".
  async function handleRequestJoin(team: OpenTeam) {
    setRequestingId(team.teamId);
    setRequestedTeams((set) => new Set(set).add(team.teamId));
    try {
      await api.requestToJoinTeam(team.teamId);
    } catch (err) {
      console.error("Failed to request to join team", err);
      setRequestedTeams((set) => {
        const next = new Set(set);
        next.delete(team.teamId);
        return next;
      });
    } finally {
      setRequestingId(null);
    }
  }

  // Invite a solo player (free agent or suggested teammate) to the caller's
  // first team. Optimistically mark "Invited".
  async function handleInviteSolo(player: SoloPlayerCardPlayer) {
    const teamId = myTeams[0]?.teamId;
    if (!teamId) return;
    setInvitingId(player.userId);
    setInvitedPlayers((set) => new Set(set).add(player.userId));
    try {
      await api.inviteToTeam(teamId, player.userId);
    } catch (err) {
      console.error("Failed to invite player to team", err);
      setInvitedPlayers((set) => {
        const next = new Set(set);
        next.delete(player.userId);
        return next;
      });
    } finally {
      setInvitingId(null);
    }
  }

  const canInvite = myTeams.length > 0;

  return (
    <>
      <AppShell right={<RailRight />}>
        <main className="tm-page" id="tm-main" data-filter={filter}>
          <div className="page-head">
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

          {/* TABS + create action */}
          <div className="tabs-row tabs-row--divided">
            <div className="tm-tabs" role="tablist" aria-label={t("tablistLabel")}>
              <button
                className={`tm-tab${filter === "mine" ? " tm-tab-active" : ""}`}
                data-filter="mine"
                onClick={() => switchTab("mine")}
              >
                {t("tabMine")}
              </button>
              <button
                className={`tm-tab${filter === "invites" ? " tm-tab-active" : ""}`}
                data-filter="invites"
                onClick={() => switchTab("invites")}
              >
                {t("tabInvites")}{" "}
                {inviteCount > 0 && <span className="tm-tab-count">{inviteCount}</span>}
              </button>
              <button
                className={`tm-tab${filter === "suggested" ? " tm-tab-active" : ""}`}
                data-filter="suggested"
                onClick={() => switchTab("suggested")}
              >
                {t("tabSuggested")}{" "}
                {suggestedTeammates.length > 0 && (
                  <span className="tm-tab-count">{suggestedTeammates.length}</span>
                )}
              </button>
              <button
                className={`tm-tab${filter === "open" ? " tm-tab-active" : ""}`}
                data-filter="open"
                onClick={() => switchTab("open")}
              >
                {t("tabOpen")}
              </button>
              <button
                className={`tm-tab${filter === "solo" ? " tm-tab-active" : ""}`}
                data-filter="solo"
                onClick={() => switchTab("solo")}
              >
                {t("tabSolo")}
              </button>
              <button
                className={`tm-tab${filter === "board" ? " tm-tab-active" : ""}`}
                data-filter="board"
                onClick={() => switchTab("board")}
              >
                {t("tabBoard")}
              </button>
            </div>
            <button className="btn btn-violet" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" /> {t("createTeam")}
            </button>
          </div>

          {/* MOJ TIM — korisnik nije u timu */}
          <section className="tm-section" data-section="mine">
            <div className="tm-hero-empty">
              <span className="tm-empty-icon" aria-hidden="true">
                <Icon name="teams" />
              </span>
              <h2 className="tm-empty-title">{t("emptyTitle")}</h2>
              <p className="tm-empty-desc">{t("emptyDesc")}</p>
              <div className="tm-hero-actions">
                <button className="btn btn-primary tm-cta-glow" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" /> {t("createTeam")}
                </button>
                <button className="btn btn-ghost" onClick={() => switchTab("invites")}>
                  {t("viewInvites")}
                </button>
              </div>
            </div>
          </section>

          {/* POZIVNICE / INVITES */}
          <section className="tm-section" data-section="invites">
            <div className="tm-ai-head">
              <div>
                <div className="tm-ai-eyebrow">
                  <Icon name="teams" /> {t("sectionInvites")}
                </div>
                <h2 className="tm-ai-h">{t("invitesHeadline")}</h2>
              </div>
            </div>

            <div className="tm-sug-grid" aria-busy={loading || undefined}>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <div key={`sk-sug-${i}`} className="card tm-sug" aria-hidden="true">
                    <div className="tm-sug-body">
                      <span className="skel skel-line" style={{ width: "30%", marginBottom: 10 }} />
                      <div className="tm-sug-avs">
                        <span className="tm-av tm-av-md is-orb skel skel-circle" />
                        <span className="tm-av tm-av-md is-orb skel skel-circle" />
                        <span className="tm-av tm-av-md is-orb skel skel-circle" />
                      </div>
                      <span className="skel skel-line" style={{ width: "55%", marginBottom: 6 }} />
                      <span className="skel skel-line" style={{ width: "80%", marginBottom: 14 }} />
                      <div className="tm-sug-actions">
                        <span
                          className="skel"
                          style={{ width: 120, height: 36, borderRadius: 10 }}
                        />
                        <span
                          className="skel"
                          style={{ width: 90, height: 36, borderRadius: 10 }}
                        />
                      </div>
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
                    busy={busyInvite === inv.invitationId}
                    meSeed={inv.invitationId}
                    onAccept={handleAcceptInvite}
                    onDecline={handleDeclineInvite}
                    forIcon
                    cardClass="card tm-sug"
                    labels={{
                      you: t("youLabel"),
                      acceptInvite: t("acceptInvite"),
                      decline: t("declineFind"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* PREDLOŽENI SAIGRAČI / SUGGESTED TEAMMATES */}
          <section className="tm-section" data-section="suggested">
            <div className="tm-ai-head">
              <div>
                <div className="tm-ai-eyebrow">
                  <Icon name="teams" /> {t("sectionSuggested")}
                </div>
                <h2 className="tm-ai-h">{t("suggestedHeadline")}</h2>
              </div>
            </div>

            <div className="tm-solo-grid">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={`sk-suggested-${i}`} className="card tm-solo" aria-busy="true">
                    <span className="tm-av tm-av-xl is-orb skel skel-circle" aria-hidden="true" />
                    <span className="skel skel-line" style={{ width: "55%" }} aria-hidden="true" />
                    <span className="skel skel-line" style={{ width: "38%" }} aria-hidden="true" />
                    <span
                      className="skel"
                      style={{ width: "100%", height: 33, borderRadius: 11 }}
                      aria-hidden="true"
                    />
                  </div>
                ))
              ) : !hasActiveHackathon ? (
                <p className="page-sub">{t("emptySuggestedNoHackathon")}</p>
              ) : suggestedTeammates.length === 0 ? (
                <p className="page-sub">{t("emptySuggested")}</p>
              ) : (
                suggestedTeammates.map((player, i) => (
                  <SoloPlayerCard
                    key={player.userId}
                    player={player}
                    index={i}
                    invited={invitedPlayers.has(player.userId)}
                    sending={invitingId === player.userId}
                    disabled={!canInvite}
                    onInvite={handleInviteSolo}
                    onOpenProfile={setPopupUser}
                    cardClass="card tm-solo"
                    score={player.score}
                    labels={{
                      inviteToTeam: t("inviteToTeam"),
                      invited: t("invited"),
                    }}
                  />
                ))
              )}
            </div>

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
                [0, 1, 2].map((i) => (
                  <div
                    key={`sk-suggested-team-${i}`}
                    className="card tm-open-card"
                    aria-hidden="true"
                  >
                    <span className="skel skel-line" style={{ width: "40%" }} />
                    <span className="skel skel-line" style={{ width: "60%", height: 18 }} />
                    <div className="tm-open-avs">
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                    </div>
                    <span className="skel skel-line" style={{ width: "50%" }} />
                    <span
                      className="skel"
                      style={{ width: 130, height: 36, borderRadius: 10, marginTop: "auto" }}
                    />
                  </div>
                ))
              ) : !hasActiveHackathon ? (
                <p className="page-sub">{t("emptySuggestedNoHackathon")}</p>
              ) : suggestedTeams.length === 0 ? (
                <p className="page-sub">{t("emptySuggestedTeams")}</p>
              ) : (
                suggestedTeams.map((team) => (
                  <OpenTeamCard
                    key={team.teamId}
                    team={team}
                    requested={requestedTeams.has(team.teamId)}
                    sending={requestingId === team.teamId}
                    onRequest={handleRequestJoin}
                    cardClass="card tm-open-card"
                    hackIcon
                    slotIcon
                    score={team.score}
                    labels={{
                      lookingFor: t("lookingFor"),
                      members: t("members"),
                      requestJoin: t("requestJoin"),
                      requested: t("requested"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* OTVORENI TIMOVI */}
          <section className="tm-section" data-section="open">
            <div className="tm-open-grid" aria-busy={loading || undefined}>
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={`sk-open-${i}`} className="card tm-open-card" aria-hidden="true">
                    <span className="skel skel-line" style={{ width: "40%" }} />
                    <span className="skel skel-line" style={{ width: "60%", height: 18 }} />
                    <div className="tm-open-avs">
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                      <span className="tm-av tm-av-md is-orb skel skel-circle" />
                    </div>
                    <span className="skel skel-line" style={{ width: "50%" }} />
                    <span
                      className="skel"
                      style={{ width: 130, height: 36, borderRadius: 10, marginTop: "auto" }}
                    />
                  </div>
                ))
              ) : openTeams.length === 0 ? (
                <p className="page-sub">{t("emptyOpen")}</p>
              ) : (
                openTeams.map((team) => (
                  <OpenTeamCard
                    key={team.teamId}
                    team={team}
                    requested={requestedTeams.has(team.teamId)}
                    sending={requestingId === team.teamId}
                    onRequest={handleRequestJoin}
                    cardClass="card tm-open-card"
                    hackIcon
                    slotIcon
                    labels={{
                      lookingFor: t("lookingFor"),
                      members: t("members"),
                      requestJoin: t("requestJoin"),
                      requested: t("requested"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* SLOBODNI IGRAČI */}
          <section className="tm-section" data-section="solo">
            <div className="tm-solo-grid">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="card tm-solo" aria-busy="true">
                    <span className="tm-av tm-av-xl is-orb skel skel-circle" aria-hidden="true" />
                    <span className="skel skel-line" style={{ width: "55%" }} aria-hidden="true" />
                    <span className="skel skel-line" style={{ width: "38%" }} aria-hidden="true" />
                    <span
                      className="skel"
                      style={{ width: "100%", height: 33, borderRadius: 11 }}
                      aria-hidden="true"
                    />
                  </div>
                ))
              ) : soloPlayers.length === 0 ? (
                <p className="page-sub">{t("emptySolo")}</p>
              ) : (
                soloPlayers.map((player, i) => (
                  <SoloPlayerCard
                    key={player.userId}
                    player={player}
                    index={i}
                    invited={invitedPlayers.has(player.userId)}
                    sending={invitingId === player.userId}
                    disabled={!canInvite}
                    onInvite={handleInviteSolo}
                    onOpenProfile={setPopupUser}
                    cardClass="card tm-solo"
                    labels={{
                      inviteToTeam: t("inviteToTeam"),
                      invited: t("invited"),
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* LEADERBOARD */}
          <section className="tm-section" data-section="board">
            <div className="tm-lb">
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="card tm-lb-row" aria-busy="true">
                    <div className="tm-lb-rank" aria-hidden="true">
                      <span className="skel skel-line" style={{ width: 12, height: 14 }} />
                    </div>
                    <div className="tm-lb-avs" aria-hidden="true">
                      {[0, 1, 2].map((j) => (
                        <span key={j} className="tm-av tm-av-sm is-orb skel skel-circle" />
                      ))}
                    </div>
                    <div className="tm-lb-name" aria-hidden="true">
                      <span className="skel skel-line" style={{ width: "60%" }} />
                    </div>
                    <span className="skel skel-line" style={{ width: 56 }} aria-hidden="true" />
                  </div>
                ))
              ) : leaderboard.length === 0 ? (
                <p className="page-sub">{t("emptyBoard")}</p>
              ) : (
                leaderboard.map((entry) => (
                  <TeamLeaderboardRow
                    key={entry.teamId}
                    entry={entry}
                    cardClass="card tm-lb-row"
                    xpMarker="flame"
                    onOpenProfile={setPopupUser}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      </AppShell>

      {/* Popups (portaled outside shell layout) */}
      <CreateTeamPopup
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          void loadAll();
        }}
      />
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

export default FindClient;
