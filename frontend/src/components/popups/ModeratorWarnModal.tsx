"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * ModeratorWarnModal — resolves a report without removing content.
 * Rendered by ModeratorClient when a moderator clicks "Resolve".
 *
 * There is no separate warning system — this only marks the report resolved
 * and (optionally) bans the user. It never claims to have sent a warning.
 */

const M = {
  title: { en: "Resolve report", sr: "Reši prijavu" },
  body: {
    en: "The report will be marked resolved without removing any content. The reporter will be notified.",
    sr: "Prijava će biti označena kao rešena bez uklanjanja sadržaja. Podnosilac prijave će biti obavešten.",
  },
  banLabel: { en: "Also ban this user", sr: "Takođe banuj ovog korisnika" },
  cancelBtn: { en: "Cancel", sr: "Otkaži" },
  confirmBtn: { en: "Resolve", sr: "Reši" },
} as const;

export function ModeratorWarnModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (banUser: boolean) => void;
}) {
  const t = useT(M);
  const [banUser, setBanUser] = useState(false);

  return (
    <div
      id="modal-warn"
      className={`modal-overlay${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-warn-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-title warn" id="modal-warn-title">
          <Icon name="flag" /> {t("title")}
        </div>
        <div className="modal-body">{t("body")}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 0" }}>
          <input type="checkbox" checked={banUser} onChange={(e) => setBanUser(e.target.checked)} />
          {t("banLabel")}
        </label>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("cancelBtn")}
          </button>
          <button className="btn btn-primary modal-confirm" onClick={() => onConfirm(banUser)}>
            {t("confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModeratorWarnModal;
