"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import * as api from "@/lib/api";
import type { TeammateSuggestion } from "@/lib/api";
import { personName } from "@/lib/displayName";

/**
 * TeamProposalPopup — SSU12 "AI uparivanje timova". Triggered by the
 * "Pronađi tim" button on a hackathon's detail page (shown only once the
 * caller is approved for that hackathon and has no team there yet).
 *
 * Unlike the ongoing ranked list on /teams/find ("Suggested" tab), this shows
 * ONE concrete team combination at a time (api.getTeamProposal), which the
 * caller accepts or rejects-and-regenerates (excluding everyone from every
 * previously rejected combination). Accepting creates a real team (caller
 * becomes leader) and sends a normal team invitation to each proposed member
 * — the team is only ever as "formed" as however many of those invitations
 * get accepted, same as a manually created team.
 */

const M = {
  dialogLabel: { en: "Find a team", sr: "Pronađi tim" },
  title: { en: "AI team match", sr: "AI uparivanje tima" },
  close: { en: "Close", sr: "Zatvori" },
  intro: {
    en: "Based on complementary skills and GitHub activity, here's a suggested team:",
    sr: "Na osnovu komplementarnih veština i GitHub aktivnosti, evo predloga tima:",
  },
  loading: { en: "Analysing candidates…", sr: "Analiziranje kandidata…" },
  noCandidates: {
    en: "Couldn't find a suitable team right now. Try again later once more participants have applied, or search for teammates manually.",
    sr: "Trenutno nije moguće pronaći odgovarajući tim. Pokušaj ponovo kasnije kada se više učesnika prijavi na hackathon, ili pretraži korisnike ručno.",
  },
  labelTeamName: { en: "Team name", sr: "Naziv tima" },
  placeholderName: { en: "e.g. nullptr, bytecraft…", sr: "npr. nullptr, bytecraft…" },
  reject: { en: "Reject and find new suggestion", sr: "Odbij i traži nov predlog" },
  accept: { en: "Accept proposal", sr: "Prihvati predlog" },
  accepting: { en: "Creating team…", sr: "Kreiranje tima…" },
  regenerating: { en: "Finding a new match…", sr: "Traženje novog predloga…" },
  accepted: {
    en: "Team created! Invitations were sent to every proposed member — the team forms as they accept.",
    sr: "Tim je kreiran! Pozivi su poslati svim predloženim članovima — tim se formira kako budu prihvatali.",
  },
  error: {
    en: "Couldn't complete the request. Try again.",
    sr: "Zahtev nije uspeo. Pokušaj ponovo.",
  },
} as const;

export function TeamProposalPopup({
  open,
  hackathonId,
  onClose,
  onTeamCreated,
}: {
  open: boolean;
  hackathonId: string;
  onClose: () => void;
  onTeamCreated?: () => void;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [members, setMembers] = useState<TeammateSuggestion[]>([]);
  const [noCandidates, setNoCandidates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setExcludeIds([]);
      setTeamName("");
      setErrorMessage(null);
      setAccepted(false);
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    api
      .getTeamProposal(hackathonId, excludeIds)
      .then((proposal) => {
        if (cancelled) return;
        setMembers(proposal.members);
        setNoCandidates(proposal.noCandidates);
      })
      .catch((err) => {
        console.error("Failed to load team proposal", err);
        if (!cancelled) {
          setMembers([]);
          setNoCandidates(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, hackathonId, excludeIds]);

  if (!open) return null;

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function handleReject() {
    setExcludeIds((prev) => [...prev, ...members.map((m) => m.userId)]);
  }

  const canAccept = teamName.trim().length > 0 && members.length > 0 && !submitting;

  async function handleAccept() {
    if (!canAccept) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await api.acceptTeamProposal(
        hackathonId,
        teamName.trim(),
        members.map((m) => m.userId),
      );
      setAccepted(true);
      onTeamCreated?.();
    } catch (err) {
      console.error("Failed to accept team proposal", err);
      setErrorMessage(err instanceof api.ApiError ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={t("dialogLabel")}
      onClick={handleBackdrop}
      onClose={onClose}
    >
      <div className="am-card" role="document">
        <div className="am-head">
          <h2 className="am-title">
            <Icon name="teams" /> {t("title")}
          </h2>
          <button className="am-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="am-body">
          {accepted ? (
            <p className="am-note">{t("accepted")}</p>
          ) : loading ? (
            <p className="am-note">{t("loading")}</p>
          ) : noCandidates ? (
            <p className="am-note">{t("noCandidates")}</p>
          ) : (
            <>
              <p className="am-note">{t("intro")}</p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {members.map((m) => (
                  <li key={m.userId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <GenerativeAvatar seed={m.username} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        {personName(m)} <span className="tm-handle">@{m.username}</span>
                      </div>
                      {m.skills.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                          {m.skills.map((s) => (
                            <span key={s} className="tag tag-v">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="badge badge-open">+{m.score}</span>
                  </li>
                ))}
              </ul>

              <div>
                <label className="am-q-label" htmlFor="tp-name">
                  {t("labelTeamName")}
                </label>
                <input
                  id="tp-name"
                  className="am-input"
                  type="text"
                  placeholder={t("placeholderName")}
                  autoComplete="off"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>
            </>
          )}

          {errorMessage && (
            <p className="am-err" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="am-foot">
          {accepted || noCandidates ? (
            <button className="btn btn-ghost" onClick={onClose}>
              {t("close")}
            </button>
          ) : (
            <>
              <button
                className="btn btn-ghost"
                disabled={loading || submitting}
                onClick={handleReject}
              >
                {loading ? t("regenerating") : t("reject")}
              </button>
              <button className="btn btn-primary" disabled={!canAccept} onClick={handleAccept}>
                <Icon name="check" /> {submitting ? t("accepting") : t("accept")}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default TeamProposalPopup;
