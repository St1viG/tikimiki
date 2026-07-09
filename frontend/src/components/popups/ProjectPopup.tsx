"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import * as api from "@/lib/api";
import type { Project } from "@/lib/api";

/**
 * ProjectPopup — create / edit / submit / withdraw a team's hackathon project.
 *
 * Opened from a team card on /teams. Loads the team's existing project (if any)
 * and adapts: no project → create a draft; draft → edit + submit; submitted →
 * edit + withdraw; under review / judged → read-only. Uses the global `.am-*`
 * modal primitive (globals.css). All writes go through the real API; `onChanged`
 * lets the caller refresh the team card's status chip.
 */

const M = {
  title: { en: "Team project", sr: "Projekat tima" },
  close: { en: "Close", sr: "Zatvori" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  forTeam: { en: "For", sr: "Za" },
  titleLabel: { en: "Project title", sr: "Naziv projekta" },
  titlePh: {
    en: "e.g. Aurora — flood early-warning",
    sr: "npr. Aurora — rano upozorenje na poplave",
  },
  descLabel: { en: "Description", sr: "Opis" },
  descPh: { en: "What it does, how it works, the stack…", sr: "Šta radi, kako radi, koji stack…" },
  repoLabel: { en: "Repository URL", sr: "Link repozitorijuma" },
  videoLabel: { en: "Demo video URL", sr: "Link demo videa" },
  videoUpload: { en: "Upload video", sr: "Otpremi video" },
  videoUploading: { en: "Uploading…", sr: "Otpremam…" },
  videoEmpty: { en: "No video yet.", sr: "Nema video snimka." },
  statusDraft: { en: "Draft", sr: "Nacrt" },
  statusSubmitted: { en: "Submitted", sr: "Predato" },
  statusReview: { en: "Under review", sr: "U pregledu" },
  statusJudged: { en: "Judged", sr: "Ocenjeno" },
  draftNote: {
    en: "Save your draft anytime, then submit before the hackathon ends to enter judging and audience voting.",
    sr: "Sačuvaj nacrt kad god želiš, pa ga predaj pre kraja hakatona da uđe u ocenjivanje i glasanje publike.",
  },
  submittedNote: { en: "Submitted on", sr: "Predato" },
  judgedNote: {
    en: "Judging has begun — this project can no longer be edited.",
    sr: "Ocenjivanje je počelo — projekat se više ne može menjati.",
  },
  createDraft: { en: "Create draft", sr: "Napravi nacrt" },
  saveChanges: { en: "Save changes", sr: "Sačuvaj izmene" },
  saving: { en: "Saving…", sr: "Čuvam…" },
  submit: { en: "Submit project", sr: "Predaj projekat" },
  submitting: { en: "Submitting…", sr: "Predajem…" },
  withdraw: { en: "Withdraw to draft", sr: "Vrati u nacrt" },
  withdrawing: { en: "Withdrawing…", sr: "Vraćam…" },
  genericError: {
    en: "Something went wrong. Try again.",
    sr: "Nešto je pošlo po zlu. Pokušaj ponovo.",
  },
} as const;

type Busy = "save" | "submit" | "withdraw" | null;

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof api.ApiError && e.message) return e.message;
  return fallback;
}

export function ProjectPopup({
  open,
  teamId,
  teamName,
  onClose,
  onChanged,
}: {
  open: boolean;
  teamId: string | null;
  teamName?: string;
  onClose: () => void;
  onChanged?: (teamId: string, project: Project | null) => void;
}) {
  const t = useT(M);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // Open/close the native dialog imperatively (matches the app's modal pattern).
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  // Load the team's existing project each time the dialog opens.
  useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getTeamProject(teamId)
      .then((p) => {
        if (!cancelled) applyProject(p);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, t("genericError")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId]);

  function applyProject(p: Project | null) {
    setProject(p);
    setTitle(p?.title ?? "");
    setDescription(p?.description ?? "");
    setRepositoryUrl(p?.repositoryUrl ?? "");
    setVideoUrl(p?.videoUrl ?? "");
  }

  const judged = project?.status === "judged" || project?.status === "under_review";
  const isSubmitted = project?.status === "submitted";
  const canEdit = !judged;
  const titleValid = title.trim().length > 0;

  function payload() {
    const clean = (s: string) => (s.trim() === "" ? null : s.trim());
    return {
      title: title.trim(),
      description: clean(description),
      repositoryUrl: clean(repositoryUrl),
      videoUrl: clean(videoUrl),
    };
  }

  async function handleSave() {
    if (!teamId || !titleValid || busy) return;
    setBusy("save");
    setError(null);
    try {
      const next = project
        ? await api.updateProject(project.projectId, payload())
        : await api.createProject(teamId, payload());
      applyProject(next);
      onChanged?.(teamId, next);
    } catch (e) {
      setError(errorMessage(e, t("genericError")));
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (!project || !teamId || busy) return;
    setBusy("submit");
    setError(null);
    try {
      const next = await api.submitProject(project.projectId);
      applyProject(next);
      onChanged?.(teamId, next);
    } catch (e) {
      setError(errorMessage(e, t("genericError")));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Upload a picked video file to `/uploads/video` and, on success, point the
   * form's `videoUrl` at the returned path so the next save persists it.
   */
  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploadingVideo(true);
    setError(null);
    try {
      const { url } = await api.uploadProjectVideo(file);
      setVideoUrl(url);
    } catch (err) {
      setError(errorMessage(err, t("genericError")));
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleWithdraw() {
    if (!project || !teamId || busy) return;
    setBusy("withdraw");
    setError(null);
    try {
      const next = await api.withdrawProject(project.projectId);
      applyProject(next);
      onChanged?.(teamId, next);
    } catch (e) {
      setError(errorMessage(e, t("genericError")));
    } finally {
      setBusy(null);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
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

  const chip = (() => {
    if (!project) return null;
    const map: Record<Project["status"], { label: string; color: string }> = {
      draft: { label: t("statusDraft"), color: "var(--muted)" },
      submitted: { label: t("statusSubmitted"), color: "var(--lemon, #ECE23A)" },
      under_review: { label: t("statusReview"), color: "var(--violet, #6E54B5)" },
      judged: { label: t("statusJudged"), color: "var(--violet, #6E54B5)" },
    };
    const { label, color } = map[project.status];
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: ".03em",
          textTransform: "uppercase",
          padding: "3px 9px",
          borderRadius: 999,
          color,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        }}
      >
        {label}
      </span>
    );
  })();

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="am-dialog"
      aria-label={t("title")}
      onClick={handleBackdrop}
      onClose={onClose}
    >
      <div className="am-card">
        <div className="am-head">
          <h2 className="am-title">
            <Icon name="rocket" /> {t("title")}
          </h2>
          {chip}
          <button className="am-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="am-body">
          {teamName && (
            <p className="am-note" style={{ marginTop: -4 }}>
              {t("forTeam")} <strong>{teamName}</strong>
            </p>
          )}

          {loading ? (
            <p className="am-note">{t("loading")}</p>
          ) : (
            <>
              <div>
                <label className="am-q-label" htmlFor="pp-title">
                  {t("titleLabel")} <span className="am-req">*</span>
                </label>
                <input
                  id="pp-title"
                  className="am-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("titlePh")}
                  maxLength={200}
                  disabled={!canEdit}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="am-q-label" htmlFor="pp-desc">
                  {t("descLabel")}
                </label>
                <textarea
                  id="pp-desc"
                  className="am-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("descPh")}
                  maxLength={5000}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="am-q-label" htmlFor="pp-repo">
                  {t("repoLabel")}
                </label>
                <input
                  id="pp-repo"
                  className="am-input"
                  type="url"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  placeholder="https://github.com/…"
                  disabled={!canEdit}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="am-q-label" htmlFor="pp-video">
                  {t("videoLabel")}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="pp-video"
                    className="am-input"
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://…"
                    disabled={!canEdit}
                    autoComplete="off"
                    style={{ flex: 1 }}
                  />
                  {canEdit && (
                    <>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/mp4,video/webm"
                        hidden
                        onChange={handleVideoFile}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={uploadingVideo || busy !== null}
                      >
                        <Icon name="upload" />{" "}
                        {uploadingVideo ? t("videoUploading") : t("videoUpload")}
                      </button>
                    </>
                  )}
                </div>
                {videoUrl ? (
                  <video
                    className="pp-video-player"
                    src={videoUrl}
                    controls
                    preload="metadata"
                    style={{
                      width: "100%",
                      marginTop: 10,
                      borderRadius: 12,
                      background: "#000",
                      maxHeight: 320,
                    }}
                  />
                ) : (
                  <p className="am-note" style={{ marginTop: 8 }}>
                    {t("videoEmpty")}
                  </p>
                )}
              </div>

              {isSubmitted && project?.submittedAt && (
                <p className="am-note">
                  {t("submittedNote")} {new Date(project.submittedAt).toLocaleString()}
                </p>
              )}
              {judged ? (
                <p className="am-note">{t("judgedNote")}</p>
              ) : (
                <p className="am-note">{t("draftNote")}</p>
              )}
              {error && <p className="am-err">{error}</p>}
            </>
          )}
        </div>

        <div className="am-foot">
          {!loading && isSubmitted && (
            <button className="btn btn-ghost" onClick={handleWithdraw} disabled={busy !== null}>
              {busy === "withdraw" ? t("withdrawing") : t("withdraw")}
            </button>
          )}

          {!loading && canEdit && (
            <button
              className={project ? "btn btn-ghost" : "btn btn-primary"}
              onClick={handleSave}
              disabled={busy !== null || !titleValid}
            >
              {busy === "save" ? t("saving") : project ? t("saveChanges") : t("createDraft")}
            </button>
          )}

          {!loading && project?.status === "draft" && (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={busy !== null || !titleValid}
            >
              <Icon name="check" /> {busy === "submit" ? t("submitting") : t("submit")}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default ProjectPopup;
