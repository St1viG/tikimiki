"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * ModeratorRemoveModal — "Remove content" confirmation dialog.
 * Rendered by ModeratorClient when a moderator clicks "Remove message/post".
 */

const M = {
  title: { en: "Remove content", sr: "Ukloni sadržaj" },
  body: {
    en: "The content will be soft-deleted immediately. The reporter will be notified of the outcome.",
    sr: "Sadržaj će odmah biti uklonjen (soft-delete). Podnosilac prijave će biti obavešten o ishodu.",
  },
  banLabel: { en: "Also ban this user", sr: "Takođe banuj ovog korisnika" },
  cancelBtn: { en: "Cancel", sr: "Otkaži" },
  confirmBtn: { en: "Confirm removal", sr: "Potvrdi uklanjanje" },
} as const;

export function ModeratorRemoveModal({
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
      id="modal-remove"
      className={`modal-overlay${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-remove-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-title danger" id="modal-remove-title">
          <Icon name="x" /> {t("title")}
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
          <button
            className="btn btn-primary modal-confirm"
            style={{ background: "var(--red)", color: "#fff" }}
            onClick={() => onConfirm(banUser)}
          >
            {t("confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModeratorRemoveModal;
