"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * CreateHackathonPopup — modal wireframe for the "Create hackathon" action.
 *
 * Props:
 *   open    — controlled visibility
 *   onClose — callback to dismiss
 */

const M = {
  dialogLabel:    { en: "Create new hackathon",                  sr: "Kreiranje novog hackathona" },
  title:          { en: "New hackathon",                         sr: "Novi hackathon" },
  close:          { en: "Close",                                 sr: "Zatvori" },
  wireframeNote:  { en: "Hackathon creation form (wireframe) — coming soon.", sr: "Forma za kreiranje hackathona (wireframe) — uskoro dostupno." },
  labelName:      { en: "Hackathon name",                        sr: "Naziv hackathona" },
  placeholderName:{ en: "e.g. ETF HackWeek 2027",               sr: "npr. ETF HackWeek 2027" },
  labelType:      { en: "Type",                                  sr: "Tip" },
  optPhysical:    { en: "Physical",                              sr: "Fizički" },
  optVirtual:     { en: "Virtual",                               sr: "Virtuelni" },
  optHybrid:      { en: "Hybrid",                                sr: "Hibridni" },
  labelDate:      { en: "Start date",                            sr: "Datum početka" },
  cancel:         { en: "Cancel",                                sr: "Otkaži" },
  create:         { en: "Create hackathon",                      sr: "Kreiraj hackathon" },
} as const;

export function CreateHackathonPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync open state with the <dialog> element
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  // Close on backdrop click (click outside the inner panel)
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      aria-label={t("dialogLabel")}
    >
      <div className="modal" role="document">
        <div className="modal-head">
          <h2 className="modal-title">
            <Icon name="hackathon" />
            {t("title")}
          </h2>
          <button
            className="modal-close"
            aria-label={t("close")}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-wireframe-note">
            {t("wireframeNote")}
          </p>
          <div className="modal-field-group">
            <label className="modal-label" htmlFor="chk-title">
              {t("labelName")}
            </label>
            <input
              id="chk-title"
              className="modal-input"
              type="text"
              placeholder={t("placeholderName")}
              disabled
            />
          </div>
          <div className="modal-field-group">
            <label className="modal-label" htmlFor="chk-type">
              {t("labelType")}
            </label>
            <select id="chk-type" className="modal-input" disabled>
              <option>{t("optPhysical")}</option>
              <option>{t("optVirtual")}</option>
              <option>{t("optHybrid")}</option>
            </select>
          </div>
          <div className="modal-field-group">
            <label className="modal-label" htmlFor="chk-date">
              {t("labelDate")}
            </label>
            <input
              id="chk-date"
              className="modal-input"
              type="date"
              disabled
            />
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-ghost hk-btn-sm"
            type="button"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            className="btn btn-primary hk-btn-sm"
            type="button"
            disabled
          >
            <Icon name="plus" />
            {t("create")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default CreateHackathonPopup;
