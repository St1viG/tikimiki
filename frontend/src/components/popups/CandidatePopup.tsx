"use client";

import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, "");
}

/* CandidatePopup — the application-review popup for the /applications page. */

const M = {
  closeBtnLabel:     { en: "Close",                   sr: "Zatvori" },
  aboutCandidate:    { en: "About the candidate",     sr: "O kandidatu" },
  skills:            { en: "Skills",                  sr: "Veštine" },
  teamLabel:         { en: "Team",                    sr: "Tim" },
  rejectReason:      { en: "Rejection reason:",       sr: "Razlog odbijanja:" },
  ghActivity:        { en: "GitHub activity",         sr: "GitHub aktivnost" },
  ghContribs:        { en: "Contributions",           sr: "Doprinosi" },
  ghRepos:           { en: "Repositories",            sr: "Repozitorijumi" },
  ghTopLang:         { en: "Top language",            sr: "Top jezik" },
  approveBtn:        { en: "Approve",                 sr: "Odobri" },
  rejectBtn:         { en: "Reject",                  sr: "Odbij" },
  approveTeamBtn:    { en: "Approve team",            sr: "Odobri tim" },
  reApproveBtn:      { en: "Re-approve",              sr: "Ponovo odobri" },
  pillPending:       { en: "Pending",                 sr: "Na čekanju" },
  pillApproved:      { en: "Approved",                sr: "Odobren/a" },
  pillRejected:      { en: "Rejected",                sr: "Odbijen/a" },
} as const;

export type CandidateStatus = "pending" | "approved" | "rejected";

export type TeamMemberData = {
  av: string;
  cls: string;
  name: string;
  status: string;
  col: string;
};

export type Candidate = {
  id: string;
  status: CandidateStatus;
  name: string;
  username: string;
  av: string;
  avClass: string;
  time: string;
  desc: string;
  skillsList: string[];
  skillsClasses: string[];
  ghContrib: string;
  ghRepos: string;
  ghLang: string;
  team?: string;
  teamMembers?: TeamMemberData[];
  rejectReason?: string;
  actionHint?: string;
};

export function CandidatePopup({
  candidate,
  onClose,
  onApprove,
  onReject,
}: {
  candidate: Candidate;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useT(M);
  const d = candidate;

  const STATUS_MAP: Record<CandidateStatus, [string, string]> = {
    pending:  ["s-pending",  t("pillPending")],
    approved: ["s-approved", t("pillApproved")],
    rejected: ["s-rejected", t("pillRejected")],
  };

  const [pillClass, pillText] = STATUS_MAP[d.status];

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="cand-overlay open"
      id="cand-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-name"
      onClick={onBackdrop}
    >
      <div className="cand-popup" id="cand-popup">
        <div className="cand-popup-header">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              className={`app-avatar ${d.avClass} is-orb`}
              id="popup-avatar"
              style={{
                width: "46px",
                height: "46px",
                fontSize: "15px",
                flexShrink: 0,
              }}
            >
              <GenerativeAvatar seed={d.username} className="orb-art" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="cand-popup-name" id="popup-name">
                {d.name}
              </div>
              <div className="cand-popup-sub" id="popup-sub">
                @{d.username} · {d.time}
              </div>
            </div>
            <span
              className={`status-pill ${pillClass}`}
              id="popup-status-pill"
              key={d.status}
              style={{ marginLeft: "auto", flexShrink: 0 }}
            >
              {pillText}
            </span>
          </div>
          <button className="cand-close-btn" onClick={onClose} aria-label={t("closeBtnLabel")}>
            <Icon name="x" />
          </button>
        </div>

        <div className="cand-popup-body">
          <div className="cand-popup-sections">
            <div>
              <div className="app-section-title">{t("aboutCandidate")}</div>
              <div className="app-desc" id="popup-desc">
                {d.desc}
              </div>
              <div style={{ marginTop: "14px" }}>
                <div className="app-section-title">{t("skills")}</div>
                <div className="skill-list" id="popup-skills">
                  {d.skillsList.map((s, i) => (
                    <span
                      key={`${s}-${i}`}
                      className={`skill-tag ${d.skillsClasses[i] || "sk-v"}`}
                    >
                      {s.trim()}
                    </span>
                  ))}
                </div>
              </div>
              {d.team && (
                <div
                  id="popup-team-wrap"
                  style={{ marginTop: "14px" }}
                >
                  <div className="app-section-title">
                    {t("teamLabel")}:{" "}
                    <span
                      id="popup-team-name"
                      style={{ color: "var(--violet-light)" }}
                    >
                      {d.team}
                    </span>
                  </div>
                  <div id="popup-team-list">
                    {(d.teamMembers || []).map((m, i) => (
                      <div className="team-member-row" key={`${m.av}-${i}`}>
                        <div className={`team-av ${m.cls} is-orb`}>
                          <GenerativeAvatar seed={slugifyName(m.name)} className="orb-art" />
                        </div>
                        <span
                          style={{
                            fontSize: "var(--fs-sm)",
                            color: "var(--ink)",
                          }}
                        >
                          {m.name}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--fs-xs)",
                            color: m.col,
                            marginLeft: "auto",
                          }}
                        >
                          {m.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {d.status === "rejected" && d.rejectReason && (
                <div id="popup-reject-wrap" style={{ marginTop: "14px" }}>
                  <div className="reject-reason-box">
                    <div
                      style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--red)",
                        fontWeight: 600,
                        marginBottom: "4px",
                      }}
                    >
                      {t("rejectReason")}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-sm)",
                        color: "var(--ink-2)",
                      }}
                      id="popup-reject-text"
                    >
                      {d.rejectReason}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="app-section-title">{t("ghActivity")}</div>
              <div className="gh-row">
                <div className="gh-stat">
                  <div className="gh-val" id="popup-gh-contrib">
                    {d.ghContrib}
                  </div>
                  <div className="gh-lbl">{t("ghContribs")}</div>
                </div>
                <div className="gh-stat">
                  <div className="gh-val" id="popup-gh-repos">
                    {d.ghRepos}
                  </div>
                  <div className="gh-lbl">{t("ghRepos")}</div>
                </div>
                <div className="gh-stat">
                  <div className="gh-val" id="popup-gh-lang">
                    {d.ghLang}
                  </div>
                  <div className="gh-lbl">{t("ghTopLang")}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="action-bar" id="popup-action-bar">
            {d.status === "pending" && (
              <>
                <button className="btn-approve" onClick={onApprove}>
                  <Icon name="check" /> {t("approveBtn")}
                </button>
                <button className="btn-reject" onClick={onReject}>
                  <Icon name="x" /> {t("rejectBtn")}
                </button>
                {d.team && (
                  <button className="btn-approve-team" onClick={onApprove}>
                    <Icon name="teams" /> {t("approveTeamBtn")}
                  </button>
                )}
              </>
            )}
            {d.status === "approved" && (
              <>
                <button className="btn-reject" onClick={onReject}>
                  <Icon name="x" /> {t("rejectBtn")}
                </button>
                <span className="action-hint">
                  {d.actionHint || "Odobreno od strane AČ"}
                </span>
              </>
            )}
            {d.status === "rejected" && (
              <>
                <button className="btn-approve" onClick={onApprove}>
                  <Icon name="check" /> {t("reApproveBtn")}
                </button>
                <span className="action-hint">
                  {d.actionHint || "Odbijeno od strane AČ"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CandidatePopup;
