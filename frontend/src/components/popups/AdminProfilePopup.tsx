"use client";

import { useEffect } from "react";
import "@/app/admin/admin.css";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import type { UserProfile } from "@/app/admin/_mockProfiles";

/**
 * AdminProfilePopup — presentational user-profile modal.
 *
 * Prop-driven: the caller resolves the profile (e.g. from the admin mock
 * fixtures) and passes it in. This component owns no data of its own.
 */

export type { UserProfile } from "@/app/admin/_mockProfiles";

const M = {
  modalTitle: { en: "User profile", sr: "Profil korisnika" },
  activityHistory: { en: "Activity history", sr: "Istorija aktivnosti" },
  noActivity: { en: "No recorded activity.", sr: "Nema zabeležene aktivnosti." },
  previousMeasures: { en: "Previous measures", sr: "Prethodne mere" },
  noMeasures: { en: "No previous measures.", sr: "Nema prethodnih mera." },
  issuedBy: { en: "Issued by:", sr: "Izdao:" },
  closeBtn: { en: "Close", sr: "Zatvori" },
  registeredLabel: { en: "Registered", sr: "Registrovan" },
  reportsLabel: { en: "Reports", sr: "Prijave" },
} as const;

function reportsColor(reports: number): string {
  return reports >= 5 ? "var(--red)" : reports > 0 ? "var(--lemon-vivid)" : "var(--muted)";
}

function measureDot(type: string): "danger" | "warn" | "info" {
  if (type.indexOf("Suspenzija") !== -1) return "danger";
  if (type === "Upozorenje") return "warn";
  return "info";
}

interface AdminProfilePopupProps {
  /** Resolved profile to display; `null` keeps the modal closed. */
  profile: UserProfile | null;
  onClose: () => void;
}

export function AdminProfilePopup({ profile, onClose }: AdminProfilePopupProps) {
  const t = useT(M);

  // Close on Escape (mirrors closeModal on overlay interactions).
  useEffect(() => {
    if (!profile) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [profile, onClose]);

  const u = profile;

  return (
    <div
      className={`modal-overlay${u ? " open" : ""}`}
      id="modal-profile"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: "560px", maxHeight: "82vh", overflowY: "auto" }}>
        <div className="modal-title" id="modal-profile-title">
          {t("modalTitle")}
        </div>

        {u && (
          <>
            <div className="adm-prof-head" style={{ marginTop: "16px" }}>
              <div
                id="prof-av"
                className={`adm-user-av ${u.avCls} is-orb`}
                style={{
                  width: "52px",
                  height: "52px",
                  fontSize: "17px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                <GenerativeAvatar seed={u.handle.replace(/^@/, "")} className="orb-art" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="adm-prof-meta-top">
                  <div className="adm-prof-name" id="prof-name">
                    {u.name}
                  </div>
                  <span className={`status-pill ${u.roleCls}`} id="prof-role">
                    {u.role}
                  </span>
                  <span className={`status-pill ${u.statusCls}`} id="prof-status">
                    {u.status}
                  </span>
                </div>
                <div className="adm-prof-sub" id="prof-handle">
                  {u.handle}
                </div>
                <div className="adm-prof-sub" id="prof-email">
                  {u.email}
                </div>
              </div>
              <div className="adm-prof-side">
                <div className="adm-prof-side-label">{t("registeredLabel")}</div>
                <div className="adm-prof-side-val" id="prof-joined">
                  {u.joined}
                </div>
                <div className="adm-prof-side-label" style={{ marginTop: "6px" }}>
                  {t("reportsLabel")}
                </div>
                <div style={{ fontWeight: 700, color: reportsColor(u.reports) }} id="prof-reports">
                  {u.reports}
                </div>
              </div>
            </div>

            <div className="adm-prof-section-label">{t("activityHistory")}</div>
            <div className="adm-timeline" id="prof-activity" style={{ margin: "0 0 4px" }}>
              {u.activity.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: "13px", padding: "6px 0" }}>
                  {t("noActivity")}
                </div>
              ) : (
                u.activity.map((a, i) => (
                  <div className="adm-tl-item" key={i}>
                    <div className="adm-tl-dot info" />
                    <div className="adm-tl-head">
                      <span className="adm-tl-action">{a.action}</span>
                      <span className="adm-tl-time">{a.time}</span>
                    </div>
                    {a.detail && <div className="adm-tl-target">{a.detail}</div>}
                  </div>
                ))
              )}
            </div>

            <div className="adm-prof-section-label" style={{ marginTop: "16px" }}>
              {t("previousMeasures")}
            </div>
            <div id="prof-measures">
              {u.measures.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: "13px", padding: "6px 0" }}>
                  {t("noMeasures")}
                </div>
              ) : (
                <div className="adm-timeline" style={{ margin: 0 }}>
                  {u.measures.map((m, i) => (
                    <div className="adm-tl-item" key={i}>
                      <div className={`adm-tl-dot ${measureDot(m.type)}`} />
                      <div className="adm-tl-head">
                        <span className="adm-tl-action">{m.type}</span>
                        <span className="adm-tl-time">{m.time}</span>
                      </div>
                      <div className="adm-tl-target">
                        {m.detail} · {t("issuedBy")} <strong>{m.by}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: "18px" }}>
          <button className="modal-cancel" onClick={onClose}>
            {t("closeBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminProfilePopup;
