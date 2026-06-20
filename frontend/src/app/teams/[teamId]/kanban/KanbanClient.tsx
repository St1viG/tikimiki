"use client";

import "./kanban.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import type { KanbanBoard, KanbanCard, KanbanColumn, Team } from "@/lib/api";

/* ── types ──────────────────────────────────────────────────── */

interface ConfirmState {
  columnId: string;
  columnName: string;
  cardCount: number;
}

interface CardModalState {
  card: KanbanCard;
  title: string;
  description: string;
  assignedTo: string;
  columnId: string;
  busy: boolean;
}

/* ── helpers ────────────────────────────────────────────────── */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/* ── component ───────────────────────────────────────────────── */

export function KanbanClient({ teamId }: { teamId: string }) {
  useRequireAuth();

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drag state
  const [draggingCard, setDraggingCard] = useState<KanbanCard | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Column rename
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Add card inline form
  const [addingCardColId, setAddingCardColId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addCardBusy, setAddCardBusy] = useState(false);

  // Add column form
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [addColBusy, setAddColBusy] = useState(false);

  // Card detail modal
  const [modal, setModal] = useState<CardModalState | null>(null);

  // Delete-column confirm dialog
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const addCardInputRef = useRef<HTMLTextAreaElement>(null);
  const addColInputRef = useRef<HTMLInputElement>(null);

  /* ── data loading ──────────────────────────────────────────── */

  const loadBoard = useCallback(async () => {
    try {
      const [b, myTeams] = await Promise.all([
        api.getKanbanBoard(teamId),
        api.getMyTeams(),
      ]);
      setBoard(b);
      setTeam(myTeams.find((t) => t.teamId === teamId) ?? null);
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  /* ── realtime ──────────────────────────────────────────────── */

  const boardId = board?.boardId;
  useEffect(() => {
    if (!boardId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit("joinKanban", boardId);
    const handler = () => void loadBoard();
    socket.on("kanban:update", handler);

    return () => {
      socket.off("kanban:update", handler);
      socket.emit("leaveKanban", boardId);
    };
  }, [boardId, loadBoard]);

  /* ── focus helpers ─────────────────────────────────────────── */

  useEffect(() => {
    if (renamingColId) renameInputRef.current?.select();
  }, [renamingColId]);

  useEffect(() => {
    if (addingCardColId) addCardInputRef.current?.focus();
  }, [addingCardColId]);

  useEffect(() => {
    if (addingCol) addColInputRef.current?.focus();
  }, [addingCol]);

  /* ── drag & drop ───────────────────────────────────────────── */

  const handleDragStart = (card: KanbanCard) => {
    setDraggingCard(card);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColId(colId);
  };

  const handleDragLeave = () => {
    setDragOverColId(null);
  };

  const handleDrop = async (colId: string) => {
    setDragOverColId(null);
    if (!draggingCard || draggingCard.columnId === colId) {
      setDraggingCard(null);
      return;
    }
    const card = draggingCard;
    setDraggingCard(null);

    // Optimistic update
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.columnId === card.columnId) {
            return { ...col, cards: col.cards.filter((c) => c.cardId !== card.cardId) };
          }
          if (col.columnId === colId) {
            return { ...col, cards: [...col.cards, { ...card, columnId: colId }] };
          }
          return col;
        }),
      };
    });

    try {
      await api.updateKanbanCard(card.cardId, { columnId: colId });
    } catch {
      void loadBoard(); // Revert on error
    }
  };

  /* ── add card ──────────────────────────────────────────────── */

  const handleAddCard = async (colId: string) => {
    const title = newCardTitle.trim();
    if (!title) {
      setAddingCardColId(null);
      setNewCardTitle("");
      return;
    }
    setAddCardBusy(true);
    try {
      await api.createKanbanCard(teamId, { columnId: colId, title });
      setNewCardTitle("");
      setAddingCardColId(null);
      // Realtime will trigger reload; also force it as fallback
      void loadBoard();
    } catch {
      // keep form open on error
    } finally {
      setAddCardBusy(false);
    }
  };

  /* ── add column ────────────────────────────────────────────── */

  const handleAddColumn = async () => {
    const name = newColName.trim();
    if (!name) {
      setAddingCol(false);
      setNewColName("");
      return;
    }
    setAddColBusy(true);
    try {
      await api.addKanbanColumn(teamId, name);
      setNewColName("");
      setAddingCol(false);
      void loadBoard();
    } catch {
      // keep form open
    } finally {
      setAddColBusy(false);
    }
  };

  /* ── rename column ─────────────────────────────────────────── */

  const startRename = (col: KanbanColumn) => {
    setRenamingColId(col.columnId);
    setRenameValue(col.name);
  };

  const commitRename = async (colId: string) => {
    const name = renameValue.trim();
    setRenamingColId(null);
    if (!name) return;
    const col = board?.columns.find((c) => c.columnId === colId);
    if (!col || col.name === name) return;
    try {
      await api.updateKanbanColumn(colId, name);
      void loadBoard();
    } catch {
      void loadBoard();
    }
  };

  /* ── delete column ─────────────────────────────────────────── */

  const handleDeleteColumnRequest = (col: KanbanColumn) => {
    const activeCards = col.cards.length;
    if (activeCards > 0) {
      setConfirm({ columnId: col.columnId, columnName: col.name, cardCount: activeCards });
    } else {
      void doDeleteColumn(col.columnId);
    }
  };

  const doDeleteColumn = async (colId: string) => {
    setConfirmBusy(true);
    try {
      await api.deleteKanbanColumn(colId);
      setConfirm(null);
      void loadBoard();
    } catch {
      // keep confirm open on error
    } finally {
      setConfirmBusy(false);
    }
  };

  /* ── card modal ────────────────────────────────────────────── */

  const openCard = (card: KanbanCard) => {
    setModal({
      card,
      title: card.title,
      description: card.description ?? "",
      assignedTo: card.assignedTo ?? "",
      columnId: card.columnId,
      busy: false,
    });
  };

  const closeModal = () => setModal(null);

  const saveModal = async () => {
    if (!modal) return;
    setModal((m) => m && { ...m, busy: true });

    const patch: Parameters<typeof api.updateKanbanCard>[1] = {};
    if (modal.title.trim() !== modal.card.title) patch.title = modal.title.trim();
    if (modal.description !== (modal.card.description ?? ""))
      patch.description = modal.description || undefined;
    if (modal.assignedTo !== (modal.card.assignedTo ?? ""))
      patch.assignedTo = modal.assignedTo || null;
    if (modal.columnId !== modal.card.columnId) patch.columnId = modal.columnId;

    try {
      if (Object.keys(patch).length > 0) {
        await api.updateKanbanCard(modal.card.cardId, patch);
      }
      closeModal();
      void loadBoard();
    } catch {
      setModal((m) => m && { ...m, busy: false });
    }
  };

  const deleteCard = async (cardId: string) => {
    try {
      await api.deleteKanbanCard(cardId);
      closeModal();
      void loadBoard();
    } catch {
      // ignore
    }
  };

  /* ── render ─────────────────────────────────────────────────── */

  return (
    <AppShell>
      <div className="kb-page">
        {/* Header */}
        <header className="kb-header">
          <div className="kb-headrow">
            <Link className="col-back" href="/teams" aria-label="Nazad na timove">
              <Icon name="arrow-left" />
            </Link>
            <div className="kb-title-group">
              <h1 className="kb-title">
                <Icon name="list" />
                Kanban
              </h1>
              {team && (
                <p className="kb-subtitle">{team.name} · {team.hackathonTitle}</p>
              )}
            </div>
          </div>
        </header>

        {/* Board */}
        {loading ? (
          <div className="kb-loading">
            <Icon name="clock" /> Učitavanje table…
          </div>
        ) : error ? (
          <div className="kb-error">
            <Icon name="x" /> {error}
          </div>
        ) : board ? (
          <div className="kb-board">
            {board.columns.map((col) => (
              <div
                key={col.columnId}
                className={`kb-col${dragOverColId === col.columnId ? " kb-col--drag-over" : ""}`}
                onDragOver={(e) => handleDragOver(e, col.columnId)}
                onDragLeave={handleDragLeave}
                onDrop={() => void handleDrop(col.columnId)}
              >
                {/* Column header */}
                <div className="kb-col-head">
                  {renamingColId === col.columnId ? (
                    <>
                      <input
                        ref={renameInputRef}
                        className="kb-col-rename"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename(col.columnId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename(col.columnId);
                          if (e.key === "Escape") setRenamingColId(null);
                        }}
                        maxLength={100}
                      />
                      <button
                        className="kb-col-btn"
                        onClick={() => setRenamingColId(null)}
                        aria-label="Otkaži preimen."
                      >
                        <Icon name="x" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="kb-col-name" title={col.name}>
                        {col.name}
                      </span>
                      <span className="kb-col-count">{col.cards.length}</span>
                      <button
                        className="kb-col-btn"
                        onClick={() => startRename(col)}
                        aria-label={`Preimenuj kolonu ${col.name}`}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        className="kb-col-btn kb-col-btn--danger"
                        onClick={() => handleDeleteColumnRequest(col)}
                        aria-label={`Obriši kolonu ${col.name}`}
                      >
                        <Icon name="trash" />
                      </button>
                    </>
                  )}
                </div>

                {/* Cards */}
                <div className="kb-cards">
                  {col.cards.map((card) => (
                    <div
                      key={card.cardId}
                      className={`kb-card${draggingCard?.cardId === card.cardId ? " kb-card--dragging" : ""}`}
                      draggable
                      onDragStart={() => handleDragStart(card)}
                      onDragEnd={() => setDraggingCard(null)}
                    >
                      <div className="kb-card-title">{card.title}</div>
                      <div className="kb-card-meta">
                        {card.assignedToUsername ? (
                          <div className="kb-card-assignee">
                            <span className="kb-card-av">
                              {initials(card.assignedToUsername)}
                            </span>
                            <span>{card.assignedToUsername}</span>
                          </div>
                        ) : (
                          <span />
                        )}
                        <button
                          className="kb-card-open-btn"
                          onClick={() => openCard(card)}
                          aria-label={`Detalji: ${card.title}`}
                        >
                          <Icon name="edit" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add card */}
                <div className="kb-add-card">
                  {addingCardColId === col.columnId ? (
                    <div className="kb-add-card-form">
                      <textarea
                        ref={addCardInputRef}
                        className="kb-add-card-input"
                        placeholder="Naziv zadatka…"
                        value={newCardTitle}
                        onChange={(e) => setNewCardTitle(e.target.value)}
                        rows={2}
                        maxLength={200}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleAddCard(col.columnId);
                          }
                          if (e.key === "Escape") {
                            setAddingCardColId(null);
                            setNewCardTitle("");
                          }
                        }}
                      />
                      <div className="kb-add-card-actions">
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 13, padding: "6px 14px" }}
                          onClick={() => void handleAddCard(col.columnId)}
                          disabled={addCardBusy || !newCardTitle.trim()}
                        >
                          {addCardBusy ? "…" : "Dodaj"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 13, padding: "6px 10px" }}
                          onClick={() => {
                            setAddingCardColId(null);
                            setNewCardTitle("");
                          }}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="kb-add-card-btn"
                      onClick={() => {
                        setAddingCardColId(col.columnId);
                        setNewCardTitle("");
                      }}
                    >
                      <Icon name="plus" /> Dodaj zadatak
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add column */}
            <div className="kb-add-col">
              {addingCol ? (
                <div className="kb-add-col-form">
                  <input
                    ref={addColInputRef}
                    className="kb-add-col-input"
                    placeholder="Naziv kolone"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    maxLength={100}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddColumn();
                      if (e.key === "Escape") {
                        setAddingCol(false);
                        setNewColName("");
                      }
                    }}
                  />
                  <div className="kb-add-col-actions">
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 13, padding: "6px 14px" }}
                      onClick={() => void handleAddColumn()}
                      disabled={addColBusy || !newColName.trim()}
                    >
                      {addColBusy ? "…" : "Dodaj kolonu"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 13, padding: "6px 10px" }}
                      onClick={() => {
                        setAddingCol(false);
                        setNewColName("");
                      }}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="kb-add-col-btn"
                  onClick={() => setAddingCol(true)}
                >
                  <Icon name="plus" /> Dodaj kolonu
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Card detail modal */}
        {modal && board && (
          <div
            className="kb-modal-scrim"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div className="kb-modal" role="dialog" aria-modal="true">
              <div className="kb-modal-head">
                <input
                  className="kb-modal-title-input"
                  value={modal.title}
                  onChange={(e) =>
                    setModal((m) => m && { ...m, title: e.target.value })
                  }
                  maxLength={200}
                  aria-label="Naziv zadatka"
                />
                <button className="kb-modal-close" onClick={closeModal} aria-label="Zatvori">
                  <Icon name="x" />
                </button>
              </div>

              <div className="kb-modal-field">
                <label className="kb-modal-label">Opis</label>
                <textarea
                  className="kb-modal-desc"
                  placeholder="Dodaj opis…"
                  value={modal.description}
                  onChange={(e) =>
                    setModal((m) => m && { ...m, description: e.target.value })
                  }
                  rows={3}
                  maxLength={10000}
                />
              </div>

              {team && team.members.length > 0 && (
                <div className="kb-modal-field">
                  <label className="kb-modal-label">Dodeli članu</label>
                  <select
                    className="kb-modal-select"
                    value={modal.assignedTo}
                    onChange={(e) =>
                      setModal((m) => m && { ...m, assignedTo: e.target.value })
                    }
                  >
                    <option value="">— Nije dodeljeno —</option>
                    {team.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName ?? m.username}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="kb-modal-field">
                <label className="kb-modal-label">Premesti u kolonu</label>
                <select
                  className="kb-modal-col-select"
                  value={modal.columnId}
                  onChange={(e) =>
                    setModal((m) => m && { ...m, columnId: e.target.value })
                  }
                >
                  {board.columns.map((col) => (
                    <option key={col.columnId} value={col.columnId}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kb-modal-footer">
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--red)", fontSize: 13 }}
                  onClick={() => void deleteCard(modal.card.cardId)}
                >
                  <Icon name="trash" /> Obriši
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                    onClick={closeModal}
                  >
                    Otkaži
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 13 }}
                    onClick={() => void saveModal()}
                    disabled={modal.busy || !modal.title.trim()}
                  >
                    {modal.busy ? "…" : "Sačuvaj"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete-column confirmation */}
        {confirm && (
          <div className="kb-confirm-scrim">
            <div className="kb-confirm" role="alertdialog" aria-modal="true">
              <h2 className="kb-confirm-title">Obriši kolonu?</h2>
              <p className="kb-confirm-body">
                Kolona <strong>&ldquo;{confirm.columnName}&rdquo;</strong> sadrži{" "}
                <strong>{confirm.cardCount} {confirm.cardCount === 1 ? "zadatak" : "zadataka"}</strong>.
                {" "}Svi zadaci biće premešteni u prvu kolonu.
              </p>
              <div className="kb-confirm-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setConfirm(null)}
                  disabled={confirmBusy}
                >
                  Otkaži
                </button>
                <button
                  className="btn"
                  style={{
                    background: "var(--red)",
                    color: "#fff",
                    fontSize: 14,
                    padding: "8px 18px",
                    borderRadius: "var(--r-sm)",
                    border: "none",
                    cursor: confirmBusy ? "not-allowed" : "pointer",
                    opacity: confirmBusy ? 0.6 : 1,
                  }}
                  onClick={() => void doDeleteColumn(confirm.columnId)}
                  disabled={confirmBusy}
                >
                  {confirmBusy ? "Brišem…" : "Obriši kolonu"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
