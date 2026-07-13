"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import * as api from "@/lib/api";
import type { HackathonSummary } from "@tikimiki/types";

/**
 * CreateTeamPopup — modal dialog for creating a new team.
 * Triggered by the "Create team" buttons on /teams and /teams/find.
 * Uses the shared, themed `.am-*` modal classes (globals.css).
 *
 * Wiring: the "Create team" button POSTs via api.createTeam(name, hackathonId).
 * The hackathon <select> is populated from api.getHackathons() so it carries
 * real hackathon ids. On success the dialog closes; the caller's onClose
 * handler reloads the team lists.
 *
 * Failure states are surfaced instead of failing silently: a hackathon-load
 * error shows an inline message with a Retry action, an empty hackathon list
 * shows "no hackathons available", and a failed create shows the backend's
 * actual error message (e.g. "Only members can create a team") rather than a
 * generic one.
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
  hackathonsLoadError: {
    en: "Could not load hackathons.",
    sr: "Učitavanje hackathona nije uspelo.",
  },
  retry: { en: "Retry", sr: "Pokušaj ponovo" },
  noHackathons: {
    en: "No hackathons available right now.",
    sr: "Trenutno nema dostupnih hackathona.",
  },
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
  const [hkError, setHkError] = useState(false);
  const [hkReloadToken, setHkReloadToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      // Reset the form each time the dialog opens.
      setName("");
      setHackathonId("");
      setErrorMessage(null);
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // Load real hackathon options (with ids) when the dialog opens (or Retry is clicked).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHk(true);
    setHkError(false);
    api
      .getHackathons()
      .then((list) => {
        // Only hackathons still open for registration can accept a new team
        // (matches the "upcoming"-only gate ApplicationsService enforces).
        if (!cancelled) setHackathons(list.filter((hk) => hk.status === "upcoming"));
      })
      .catch((err) => {
        console.error("Failed to load hackathons for team creation", err);
        if (!cancelled) setHkError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingHk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, hkReloadToken]);

  // Close on backdrop click
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  const canSubmit = name.trim().length > 0 && hackathonId !== "" && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await api.createTeam(name.trim(), hackathonId);
      onClose();
    } catch (err) {
      console.error("Failed to create team", err);
      setErrorMessage(err instanceof api.ApiError ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={t("dialogLabel")}
      onClick={handleClick}
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
          <div>
            <label className="am-q-label" htmlFor="ct-name">
              {t("labelName")}
            </label>
            <input
              id="ct-name"
              className="am-input"
              type="text"
              placeholder={t("placeholderName")}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="am-q-label" htmlFor="ct-hackathon">
              {t("labelHackathon")}
            </label>
            <select
              id="ct-hackathon"
              className="am-input"
              value={hackathonId}
              onChange={(e) => setHackathonId(e.target.value)}
              disabled={loadingHk}
            >
              <option value="">
                {loadingHk
                  ? t("loadingHackathons")
                  : hkError
                    ? t("hackathonsLoadError")
                    : hackathons.length === 0
                      ? t("noHackathons")
                      : t("selectHackathon")}
              </option>
              {hackathons.map((hk) => (
                <option key={hk.hackathonId} value={hk.hackathonId}>
                  {hk.title}
                </option>
              ))}
            </select>

            {hkError && !loadingHk && (
              <p className="am-err" role="alert" style={{ marginTop: 8 }}>
                {t("hackathonsLoadError")}{" "}
                <button
                  type="button"
                  onClick={() => setHkReloadToken((n) => n + 1)}
                  style={{
                    color: "inherit",
                    fontWeight: 600,
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {t("retry")}
                </button>
              </p>
            )}
          </div>

          <div>
            <label className="am-q-label" htmlFor="ct-roles">
              {t("labelRoles")}
            </label>
            <input
              id="ct-roles"
              className="am-input"
              type="text"
              placeholder={t("placeholderRoles")}
              autoComplete="off"
            />
          </div>

          {errorMessage && (
            <p className="am-err" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="am-foot">
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
