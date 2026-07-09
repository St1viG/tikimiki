"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * ModeratorWarnModal — "Warn user" confirmation dialog.
 * Rendered by ModeratorClient when a moderator clicks "Warn user".
 */

const M = {
  title: { en: "Warn user", sr: "Upozori korisnika" },
  body: {
    en: "The user will be sent an official warning. Repeated violations may lead to account suspension by an administrator.",
    sr: "Korisniku će biti poslato zvanično upozorenje. Ponovljeni prekršaji mogu dovesti do suspenzije naloga od strane administratora.",
  },
  cancelBtn: { en: "Cancel", sr: "Otkaži" },
  confirmBtn: { en: "Send warning", sr: "Pošalji upozorenje" },
} as const;

export function ModeratorWarnModal({
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
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("cancelBtn")}
          </button>
          <button className="btn btn-primary modal-confirm" onClick={onConfirm}>
            {t("confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModeratorWarnModal;
