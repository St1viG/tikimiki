"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LanguageProvider";

/* RejectModal — the "Reject application" reason modal for the /applications page. */

const M = {
  title:       { en: "Reject application",                                                       sr: "Odbij prijavu" },
  sub:         { en: "Enter a rejection reason (optional). Candidate @{username} will be notified.", sr: "Unesite razlog odbijanja (opciono). Kandidat @{username} će biti obavešten." },
  reasonLabel: { en: "Rejection reason",                                                          sr: "Razlog odbijanja" },
  reasonPh:    { en: "e.g. Profile does not match the hackathon theme...",                        sr: "npr. Profil ne odgovara temi hackathona..." },
  cancelBtn:   { en: "Cancel",                                                                    sr: "Otkaži" },
  confirmBtn:  { en: "Confirm rejection",                                                         sr: "Potvrdi odbijanje" },
} as const;

export function RejectModal({
  username,
  onCancel,
  onConfirm,
}: {
  username: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT(M);
  const [reason, setReason] = useState("");

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const subText = t("sub").replace("{username}", username);

  return (
    <div className="modal-overlay open" id="reject-modal" onClick={onBackdrop}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
        <div className="modal-title" id="reject-modal-title">
          {t("title")}
        </div>
        <div className="modal-sub" id="modal-sub-text">
          {subText}
        </div>
        <label className="sr-only" htmlFor="reject-reason">
          {t("reasonLabel")}
        </label>
        <textarea
          id="reject-reason"
          placeholder={t("reasonPh")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel}>
            {t("cancelBtn")}
          </button>
          <button
            className="modal-confirm"
            onClick={() => onConfirm(reason.trim())}
          >
            {t("confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RejectModal;
