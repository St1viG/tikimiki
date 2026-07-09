"use client";

import clsx from "clsx";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * BountyUnapplyModal — confirmation dialog for un-applying a team from a
 * sponsor bounty in the /cohor chat app.
 *
 * Clicking the dimmed overlay (but not the dialog) cancels; the cancel and
 * confirm buttons call back to the parent. Open/close animation (`.show`) and
 * all styling come from cohor.css. The parent owns `open` and the bounty name.
 */

const M = {
  title: { en: "Unapply from bounty", sr: "Odjava sa bounty-a" },
  descPre: {
    en: "Are you sure you want to unapply team",
    sr: "Da li sigurno želiš da odjaviš tim",
  },
  descMid: { en: "from the bounty", sr: "sa bounty-a" },
  descPost: {
    en: "? Your solution will no longer be considered for this reward.",
    sr: "? Vaše rešenje više neće biti razmatrano za ovu nagradu.",
  },
  cancel: { en: "Cancel", sr: "Odustani" },
  confirm: { en: "Yes, unapply me", sr: "Da, odjavi me" },
} as const;

export function BountyUnapplyModal({
  open,
  bountyName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  bountyName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT(M);

  return (
    <div
      id="bounty-modal-overlay"
      className={clsx("bounty-modal-overlay", open && "show")}
      style={open ? { display: "flex" } : { display: "none" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        id="bounty-modal"
        className="bounty-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="bounty-modal-ic">
          <Icon name="arrow-left" />
        </div>
        <div className="bounty-modal-title" id="modal-title">
          {t("title")}
        </div>
        <div className="bounty-modal-desc" id="modal-desc">
          {t("descPre")} <strong style={{ color: "var(--violet-light)" }}>digitalci</strong>{" "}
          {t("descMid")}{" "}
          <strong id="modal-bounty-name" style={{ color: "var(--ink)" }}>
            {bountyName}
          </strong>
          {t("descPost")}
        </div>
        <div className="bounty-modal-actions">
          <button
            type="button"
            id="modal-cancel-btn"
            className="bounty-modal-cancel"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            id="modal-confirm-btn"
            className="bounty-modal-confirm"
            onClick={onConfirm}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BountyUnapplyModal;
