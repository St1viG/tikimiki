"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import "@/app/admin/admin.css";
import { useT } from "@/components/i18n/LanguageProvider";

/* AdminAppealPopup — appeal approve/reject modal. */

const M = {
  approveTitle: { en: "Approve appeal?", sr: "Prihvati žalbu?" },
  approveSub: {
    en: 'Measure "{measure}" for @{user} will be lifted and the user will be notified of the decision.',
    sr: 'Mera "{measure}" za @{user} biće ukinuta i korisnik će biti obavešten o odluci.',
  },
  approveSubDefault: {
    en: "The measure will be lifted and the user will be notified of the decision.",
    sr: "Mera će biti ukinuta i korisnik će biti obavešten o odluci.",
  },
  approveReasonAria: { en: "Decision justification", sr: "Obrazloženje odluke" },
  approveReasonPh: {
    en: "Decision justification (required)...",
    sr: "Obrazloženje odluke (obavezno)...",
  },
  approveConfirmBtn: { en: "Approve and lift measure", sr: "Prihvati i ukini meru" },
  rejectTitle: { en: "Reject appeal", sr: "Odbij žalbu" },
  rejectSub: {
    en: 'Measure "{measure}" for @{user} remains in force. The user will be notified of the rejection reason.',
    sr: 'Mera "{measure}" za @{user} ostaje na snazi. Korisnik će biti obavešten o razlogu odbijanja.',
  },
  rejectSubDefault: {
    en: "The measure remains in force. The user will be notified of the decision and rejection reason.",
    sr: "Mera ostaje na snazi. Korisnik će biti obavešten o odluci i razlogu odbijanja.",
  },
  rejectReasonAria: { en: "Rejection justification", sr: "Obrazloženje odbijanja" },
  rejectReasonPh: {
    en: "Rejection justification (required)...",
    sr: "Obrazloženje odbijanja (obavezno)...",
  },
  rejectConfirmBtn: { en: "Reject appeal", sr: "Odbij žalbu" },
  cancelBtn: { en: "Cancel", sr: "Odustani" },
} as const;

export type AppealAction = "approve" | "reject";

export interface AppealRequest {
  action: AppealAction;
  userId: string;
  measure: string;
}

interface AdminAppealPopupProps {
  request: AppealRequest | null;
  onClose: () => void;
  onConfirm: (action: AppealAction, reason: string) => void;
}

export function AdminAppealPopup({ request, onClose, onConfirm }: AdminAppealPopupProps) {
  const t = useT(M);
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the textarea each time a new appeal opens.
  useEffect(() => {
    setReason("");
  }, [request]);

  // Close on Escape.
  useEffect(() => {
    if (!request) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [request, onClose]);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      textareaRef.current?.focus();
      return;
    }
    onConfirm(request!.action, trimmed);
  };

  const open = request !== null;
  const isApprove = request?.action === "approve";

  // Dynamic sub-line text.
  const approveSub = request
    ? t("approveSub").replace("{measure}", request.measure).replace("{user}", request.userId)
    : t("approveSubDefault");
  const rejectSub = request
    ? t("rejectSub").replace("{measure}", request.measure).replace("{user}", request.userId)
    : t("rejectSubDefault");

  return (
    <div
      className={`modal-overlay${open && isApprove ? " open" : ""}`}
      id="modal-appeal-approve"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-appeal-approve-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Approve modal */}
      {open && isApprove && (
        <div className="modal">
          <div
            className="modal-title"
            id="modal-appeal-approve-title"
            style={{ color: "var(--green)" }}
          >
            <Icon name="check" /> {t("approveTitle")}
          </div>
          <div className="modal-sub" id="appeal-approve-sub">
            {approveSub}
          </div>
          <textarea
            id="appeal-approve-reason"
            ref={textareaRef}
            aria-label={t("approveReasonAria")}
            placeholder={t("approveReasonPh")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="modal-cancel" onClick={onClose}>
              {t("cancelBtn")}
            </button>
            <button
              className="modal-confirm"
              style={{
                color: "var(--green)",
                background: "color-mix(in srgb, var(--green) 14%, transparent)",
                borderColor: "var(--green)",
              }}
              onClick={handleConfirm}
            >
              {t("approveConfirmBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Reject modal — rendered in a sibling overlay so each id stays unique. */}
      {open && !isApprove && (
        <AdminAppealRejectInner
          t={t}
          sub={rejectSub}
          reason={reason}
          setReason={setReason}
          textareaRef={textareaRef}
          onClose={onClose}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

/**
 * Inner reject modal markup. Kept as a separate node so it carries the
 * `modal-appeal-reject` id/labelledby while still sharing the
 * single controlled overlay above.
 */
function AdminAppealRejectInner({
  t,
  sub,
  reason,
  setReason,
  textareaRef,
  onClose,
  onConfirm,
}: {
  t: (key: keyof typeof M) => string;
  sub: string;
  reason: string;
  setReason: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal" aria-labelledby="modal-appeal-reject-title">
      <div className="modal-title" id="modal-appeal-reject-title">
        {t("rejectTitle")}
      </div>
      <div className="modal-sub" id="appeal-reject-sub">
        {sub}
      </div>
      <textarea
        id="appeal-reject-reason"
        ref={textareaRef}
        aria-label={t("rejectReasonAria")}
        placeholder={t("rejectReasonPh")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="modal-actions">
        <button className="modal-cancel" onClick={onClose}>
          {t("cancelBtn")}
        </button>
        <button className="modal-confirm" onClick={onConfirm}>
          {t("rejectConfirmBtn")}
        </button>
      </div>
    </div>
  );
}

export default AdminAppealPopup;
