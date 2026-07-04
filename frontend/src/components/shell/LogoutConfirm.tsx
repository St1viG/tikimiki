"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * LogoutConfirm — the centered "are you sure?" dialog shown before signing
 * out. Shared by the account menus in RailLeft (app shell) and the Cohor
 * UserStrip. Backdrop click and Escape cancel it, both blocked while the
 * logout request is in flight; the caller owns the actual logout.
 *
 * Rendered through a portal to <body>: inside .cohor-app the scoped reset
 * (margin/padding zero, button font:inherit) would flatten the dialog, and
 * any transformed ancestor would hijack its position:fixed centring.
 */

const M = {
  logoutTitle: { en: "Log out?",  sr: "Odjava?" },
  logoutDesc: {
    en: "You'll be signed out on this device.",
    sr: "Bićeš odjavljen sa ovog uređaja.",
  },
  cancel:     { en: "Cancel",      sr: "Otkaži" },
  logOut:     { en: "Log out",     sr: "Odjavi se" },
  loggingOut: { en: "Logging out…", sr: "Odjavljivanje…" },
} as const;

export function LogoutConfirm({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT(M);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-logout-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="confirm-box">
        <div className="confirm-ic" aria-hidden="true">
          <Icon name="logout" />
        </div>
        <h2 className="confirm-title" id="confirm-logout-title">
          {t("logoutTitle")}
        </h2>
        <p className="confirm-desc">{t("logoutDesc")}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? t("loggingOut") : t("logOut")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default LogoutConfirm;
