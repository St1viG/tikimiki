"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import * as api from "@/lib/api";
import type { HackathonSummary } from "@tikimiki/types";

/**
 * CreateTeamPopup — modal dialog for creating a new team.
 * Triggered by the "Create team" buttons on /teams and /teams/find.
 * Uses the standard app.css modal/overlay/dialog classes.
 *
 * Wiring: the "Create team" button POSTs via api.createTeam(name, hackathonId).
 * The hackathon <select> is populated from api.getHackathons() so it carries
 * real hackathon ids. On success the dialog closes; the caller's onClose
 * handler reloads the team lists.
 */

const M = {
  dialogLabel: { en: "Create team", sr: "Kreiraj tim" },
  title: { en: "Create team", sr: "Kreiraj tim" },
  close: { en: "Close", sr: "Zatvori" },
  labelName: { en: "Team name", sr: "Naziv tima" },
  placeholderName: { en: "e.g. nullptr, bytecraft…", sr: "npr. nullptr, bytecraft…" },
  labelHackathon: { en: "Hackathon", sr: "Hackathon" },
  selectHackathon: { en: "— Select hackathon —", sr: "— Odaberi hackathon —" },
  loadingHackathons: { en: "Loading hackathons…", sr: "Učitavanje hackathona…" },
  labelRoles: { en: "Roles you're looking for?", sr: "Koje uloge tražite?" },
  placeholderRoles: { en: "e.g. Backend, ML, Frontend…", sr: "npr. Backend, ML, Frontend…" },
  cancel: { en: "Cancel", sr: "Otkaži" },
  create: { en: "Create team", sr: "Kreiraj tim" },
  creating: { en: "Creating…", sr: "Kreiranje…" },
  error: {
    en: "Could not create team. Try again.",
    sr: "Kreiranje tima nije uspelo. Pokušaj ponovo.",
  },
} as const;

export function CreateTeamPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState("");
  const [hackathonId, setHackathonId] = useState("");
  const [hackathons, setHackathons] = useState<HackathonSummary[]>([]);
  const [loadingHk, setLoadingHk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      // Reset the form each time the dialog opens.
      setName("");
      setHackathonId("");
      setError(false);
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // Load real hackathon options (with ids) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHk(true);
    api
      .getHackathons()
      .then((list) => {
        if (!cancelled) setHackathons(list);
      })
      .catch((err) => {
        console.error("Failed to load hackathons for team creation", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingHk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on backdrop click
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (
      rect &&
      (e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom)
    ) {
      onClose();
    }
  }

  const canSubmit = name.trim().length > 0 && hackathonId !== "" && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(false);
    try {
      await api.createTeam(name.trim(), hackathonId);
      onClose();
    } catch (err) {
      console.error("Failed to create team", err);
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-label={t("dialogLabel")}
      onClick={handleClick}
      onClose={onClose}
    >
      <div className="modal-box">
        <div className="modal-head">
          <h2 className="modal-title">
            <Icon name="teams" /> {t("title")}
          </h2>
          <button className="modal-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">
          <label className="field-label" htmlFor="ct-name">
            {t("labelName")}
          </label>
          <input
            id="ct-name"
            className="field"
            type="text"
            placeholder={t("placeholderName")}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="field-label" htmlFor="ct-hackathon">
            {t("labelHackathon")}
          </label>
          <select
            id="ct-hackathon"
            className="field"
            value={hackathonId}
            onChange={(e) => setHackathonId(e.target.value)}
            disabled={loadingHk}
          >
            <option value="">{loadingHk ? t("loadingHackathons") : t("selectHackathon")}</option>
            {hackathons.map((hk) => (
              <option key={hk.hackathonId} value={hk.hackathonId}>
                {hk.title}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="ct-roles">
            {t("labelRoles")}
          </label>
          <input
            id="ct-roles"
            className="field"
            type="text"
            placeholder={t("placeholderRoles")}
            autoComplete="off"
          />

          {error && (
            <p
              role="alert"
              style={{ color: "var(--red)", fontSize: 13, fontWeight: 600, marginTop: 8 }}
            >
              {t("error")}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={handleCreate}>
            <Icon name="plus" /> {submitting ? t("creating") : t("create")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default CreateTeamPopup;
