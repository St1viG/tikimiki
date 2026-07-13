"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { ApiError, createReport, type ReportCategory, type ReportTargetType } from "@/lib/api";

/**
 * ReportPopup — modal for reporting a post, comment, or user profile.
 * Uses the shared, themed `.am-*` modal classes (globals.css), same pattern
 * as JoinTeamPopup.
 */

const M = {
  close: { en: "Close", sr: "Zatvori" },
  title: { en: "Report content", sr: "Prijavi sadržaj" },
  desc: {
    en: "Reports are reviewed by an admin. Misuse of this feature may affect your account.",
    sr: "Prijave pregleda administrator. Zloupotreba ove funkcije može uticati na tvoj nalog.",
  },
  labelCategory: { en: "Reason", sr: "Razlog" },
  categorySpam: { en: "Spam", sr: "Spam" },
  categoryHarassment: { en: "Harassment", sr: "Uznemiravanje" },
  categoryInappropriate: { en: "Inappropriate content", sr: "Neprikladan sadržaj" },
  categoryOther: { en: "Other", sr: "Ostalo" },
  labelDetails: { en: "Details (optional)", sr: "Detalji (opciono)" },
  placeholderDetails: {
    en: "Add any extra context that could help review this report…",
    sr: "Dodaj dodatni kontekst koji može pomoći pri pregledu prijave…",
  },
  cancel: { en: "Cancel", sr: "Otkaži" },
  submit: { en: "Submit report", sr: "Pošalji prijavu" },
  submitting: { en: "Submitting…", sr: "Slanje…" },
  errorDuplicate: {
    en: "You have already reported this.",
    sr: "Već si prijavio/la ovo.",
  },
  errorGeneric: {
    en: "Could not submit the report. Please try again.",
    sr: "Prijava nije mogla biti poslata. Pokušaj ponovo.",
  },
} as const;

const CATEGORIES: { value: ReportCategory; labelKey: keyof typeof M }[] = [
  { value: "spam", labelKey: "categorySpam" },
  { value: "harassment", labelKey: "categoryHarassment" },
  { value: "inappropriate_content", labelKey: "categoryInappropriate" },
  { value: "other", labelKey: "categoryOther" },
];

export function ReportPopup({
  open,
  targetType,
  targetId,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<ReportCategory>("spam");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setCategory("spam");
      setReason("");
      setError(null);
      setSubmitting(false);
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await createReport(targetType, targetId, category, reason.trim() || undefined);
      onSubmitted?.();
      onClose();
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 409) {
        setError(t("errorDuplicate"));
      } else {
        setError(t("errorGeneric"));
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={t("title")}
      onClick={handleBackdrop}
      onClose={onClose}
    >
      <div className="am-card" role="document">
        <div className="am-head">
          <h2 className="am-title">
            <Icon name="flag" /> {t("title")}
          </h2>
          <button className="am-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="am-body">
          <p className="am-note">{t("desc")}</p>

          <div>
            <label className="am-q-label" htmlFor="rp-category">
              {t("labelCategory")}
            </label>
            <select
              id="rp-category"
              className="am-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="am-q-label" htmlFor="rp-reason">
              {t("labelDetails")}
            </label>
            <textarea
              id="rp-reason"
              className="am-textarea"
              rows={3}
              maxLength={1000}
              placeholder={t("placeholderDetails")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <p className="am-err">{error}</p>}
        </div>

        <div className="am-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button className="btn btn-violet" onClick={handleSubmit} disabled={submitting}>
            <Icon name="flag" /> {submitting ? t("submitting") : t("submit")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ReportPopup;
