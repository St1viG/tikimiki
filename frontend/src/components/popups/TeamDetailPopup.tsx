"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AvatarStack } from "@/components/teams";
import type { Team } from "@/lib/api";

/**
 * TeamDetailPopup — roster view opened by clicking a "My teams" card.
 * Read-only: shows who's on the team and their role; clicking a member opens
 * their <ProfilePopup/> (parent supplies onOpenProfile, same pattern as the
 * join-request rows on /teams).
 */

const M = {
  close: { en: "Close", sr: "Zatvori" },
  members: { en: "Members", sr: "Članovi" },
  leader: { en: "Leader", sr: "Vođa tima" },
  member: { en: "Member", sr: "Član" },
} as const;

export function TeamDetailPopup({
  open,
  team,
  onClose,
  onOpenProfile,
  meId,
}: {
  open: boolean;
  team: Team | null;
  onClose: () => void;
  onOpenProfile: (username: string) => void;
  meId?: string | null;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && team) el.showModal();
    else el.close();
  }, [open, team]);

  if (!open || !team) return null;

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={team.name}
      onClick={handleBackdrop}
      onClose={onClose}
    >
      <div className="am-card" role="document">
        <div className="am-head">
          <h2 className="am-title">
            <Icon name="teams" /> {team.name}
          </h2>
          <button className="am-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="am-body">
          <p className="am-note">
            <Icon name="hackathon" /> {team.hackathonTitle}
          </p>

          <AvatarStack
            className="tm-tc-avs"
            members={team.members}
            size="xl"
            meId={meId}
            onOpenProfile={onOpenProfile}
          />

          <label className="am-q-label" style={{ marginTop: 14, display: "block" }}>
            {t("members")}
          </label>
          <div className="tm-joinreqs">
            {team.members.map((m) => (
              <div key={m.userId} className="tm-joinreq">
                <div className="tm-joinreq-info">
                  <button
                    type="button"
                    className="tm-joinreq-name"
                    onClick={() => onOpenProfile(m.username)}
                  >
                    {m.displayName || m.username}
                  </button>
                  <span className="tm-joinreq-sub">
                    {" "}
                    {m.role === "leader" ? t("leader") : t("member")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="am-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default TeamDetailPopup;
