"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * JoinTeamPopup — modal dialog for requesting to join an open team.
 * Triggered by the "Request to join" / "Invite to team" buttons on the team
 * pages. Uses the shared, themed `.am-*` modal classes (globals.css).
 */

const M = {
  close:          { en: "Close",                              sr: "Zatvori" },
  title:          { en: "Request to join",                    sr: "Zatraži priključenje" },
  descPre:        { en: "You are sending a join request to team", sr: "Šalješ zahtev za priključenje timu" },
  descPost:       { en: ". The team captain will review your profile and respond.", sr: ". Kapiten tima će pregledati tvoj profil i odgovoriti." },
  labelMsg:       { en: "Message (optional)",                 sr: "Poruka (opciono)" },
  placeholderMsg: { en: "Briefly introduce yourself or say why you're a good fit…", sr: "Kratko se predstavi ili navedi zašto si dobar fit…" },
  cancel:         { en: "Cancel",                             sr: "Otkaži" },
  sendRequest:    { en: "Send request",                       sr: "Pošalji zahtev" },
} as const;

export function JoinTeamPopup({
  open,
  teamName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  teamName: string;
  onClose: () => void;
  onSubmit?: (message: string) => void;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setMessage("");
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function handleSend() {
    onSubmit?.(message.trim());
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={`${t("title")}: ${teamName}`}
      onClick={handleBackdrop}
      onClose={onClose}
    >
      <div className="am-card" role="document">
        <div className="am-head">
          <h2 className="am-title">
            <Icon name="teams" /> {t("title")}
          </h2>
          <button className="am-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="am-body">
          <p className="am-note">
            {t("descPre")} <strong>{teamName}</strong>
            {t("descPost")}
          </p>

          <div>
            <label className="am-q-label" htmlFor="jt-msg">
              {t("labelMsg")}
            </label>
            <textarea
              id="jt-msg"
              className="am-textarea"
              rows={3}
              placeholder={t("placeholderMsg")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <div className="am-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="btn btn-violet" onClick={handleSend}>
            <Icon name="check" /> {t("sendRequest")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default JoinTeamPopup;
