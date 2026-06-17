"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * ModeratorRemoveModal — "Remove content" confirmation dialog.
 * Rendered by ModeratorClient when a moderator clicks "Remove message/post".
 */

const M = {
  title:      { en: "Remove content",                                                                                                                sr: "Ukloni sadržaj" },
  body:       { en: "The content will be permanently removed from the channel. The author will be notified that the content was removed for violating community guidelines.", sr: "Sadržaj će biti trajno uklonjen iz kanala. Autor će biti obavešten da je sadržaj uklonjen zbog kršenja pravila zajednice." },
  cancelBtn:  { en: "Cancel",                                                                                                                        sr: "Otkaži" },
  confirmBtn: { en: "Confirm removal",                                                                                                               sr: "Potvrdi uklanjanje" },
} as const;

export function ModeratorRemoveModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT(M);

  return (
    <div
      id="modal-remove"
      className={`modal-overlay${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-remove-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box">
        <div className="modal-title danger" id="modal-remove-title">
          <Icon name="x" /> {t("title")}
        </div>
        <div className="modal-body">
          {t("body")}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{t("cancelBtn")}</button>
          <button
            className="btn btn-primary modal-confirm"
            style={{ background: "var(--red)", color: "#fff" }}
            onClick={onConfirm}
          >
            {t("confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModeratorRemoveModal;
