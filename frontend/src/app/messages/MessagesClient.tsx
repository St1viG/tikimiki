"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth, useRequireAuth } from "@/components/auth/AuthProvider";
import {
  type ChatMessage,
  type Conversation,
  getConversationMessages,
  getConversations,
  sendDirectMessage,
} from "@/lib/api";
import { getSocket } from "@/lib/socket";

/** /messages — real direct-message conversations with live updates. */

const M = {
  back: { en: "Back", sr: "Nazad" },
  title: { en: "Messages", sr: "Poruke" },
  sub: { en: "Your direct messages", sr: "Tvoje privatne poruke" },
  empty: { en: "No conversations yet.", sr: "Još nema konverzacija." },
  pick: { en: "Pick a conversation.", sr: "Izaberi konverzaciju." },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  noMessages: { en: "No messages yet — say hi 👋", sr: "Još nema poruka — pozdravi se 👋" },
  placeholder: { en: "Write a message…", sr: "Napiši poruku…" },
  send: { en: "Send", sr: "Pošalji" },
} as const;

export function MessagesClient() {
  const { status } = useRequireAuth();
  const { user } = useAuth();
  const t = useT(M);
  const params = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  // Load conversations; preselect ?c= or the first one.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getConversations()
      .then((convs) => {
        if (cancelled) return;
        setConversations(convs);
        const wanted = params.get("c");
        setActiveId(
          wanted && convs.some((c) => c.conversationId === wanted)
            ? wanted
            : (convs[0]?.conversationId ?? null),
        );
      })
      .catch(() => setConversations([]));
    return () => {
      cancelled = true;
    };
  }, [status, params]);

  // Load + live-subscribe to the active conversation.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setMessages(null);
    getConversationMessages(activeId)
      .then((m) => !cancelled && setMessages(m))
      .catch(() => !cancelled && setMessages([]));

    const s = getSocket();
    // Subscribe to server-push events for this thread only; unsubscribe on cleanup.
    s?.emit("joinConversation", activeId);
    const onDm = (msg: ChatMessage) => {
      if (msg.conversationId !== activeId) return;
      // A message may arrive via both the REST response and the socket push —
      // deduplicate by messageId to avoid double-rendering.
      setMessages((prev) =>
        prev && prev.some((m) => m.messageId === msg.messageId) ? prev : [...(prev ?? []), msg],
      );
      requestAnimationFrame(() => {
        if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
      });
    };
    s?.on("directMessage", onDm);
    return () => {
      cancelled = true;
      s?.emit("leaveConversation", activeId);
      s?.off("directMessage", onDm);
    };
  }, [activeId]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    try {
      const created = await sendDirectMessage(activeId, content);
      setMessages((prev) =>
        prev && prev.some((m) => m.messageId === created.messageId)
          ? prev
          : [...(prev ?? []), created],
      );
      setDraft("");
      requestAnimationFrame(() => {
        if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const title = (c: Conversation) =>
    c.members
      .filter((m) => m.userId !== user?.userId)
      .map((m) => m.username)
      .join(", ") || "—";

  return (
    <AppShell variant="no-right">
      <main className="feed" id="main">
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="comment" /> {t("title")}
            </h1>
            <p className="page-sub">{t("sub")}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Conversation list */}
          <div style={{ width: 220, flexShrink: 0, display: "grid", gap: 6 }}>
            {conversations.length === 0 && <p className="time">{t("empty")}</p>}
            {conversations.map((c) => (
              <button
                key={c.conversationId}
                type="button"
                className="post"
                onClick={() => setActiveId(c.conversationId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  cursor: "pointer",
                  border:
                    c.conversationId === activeId
                      ? "1px solid var(--violet-light, #a78bfa)"
                      : "1px solid var(--line)",
                  background: "none",
                  textAlign: "left",
                }}
              >
                <span className="avatar v is-orb" style={{ width: 34, height: 34 }}>
                  <GenerativeAvatar seed={title(c)} className="orb-art" />
                </span>
                <span style={{ overflow: "hidden" }}>
                  <span className="name" style={{ display: "block" }}>
                    {title(c)}
                  </span>
                  {c.lastMessage && (
                    <span
                      className="time"
                      style={{
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 150,
                      }}
                    >
                      {c.lastMessage.content}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Thread */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!activeId ? (
              <p className="time" style={{ padding: 8 }}>
                {t("pick")}
              </p>
            ) : (
              <>
                <div
                  ref={streamRef}
                  style={{
                    display: "grid",
                    gap: 10,
                    maxHeight: "60vh",
                    overflowY: "auto",
                    paddingRight: 4,
                  }}
                >
                  {messages === null &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={`skel-${i}`}
                        style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                        aria-busy="true"
                      >
                        <span
                          className="skel skel-circle"
                          aria-hidden="true"
                          style={{ width: 34, height: 34, flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span className="skel skel-line" style={{ width: 120, height: 12 }} />
                          <span
                            className="skel skel-line"
                            style={{ width: `${68 - i * 9}%`, height: 12, marginTop: 7 }}
                          />
                        </div>
                      </div>
                    ))}
                  {messages?.length === 0 && <p className="time">{t("noMessages")}</p>}
                  {messages?.map((m) => (
                    <div
                      key={m.messageId}
                      style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                    >
                      <Link
                        href={`/u/${m.senderUsername}`}
                        className="avatar v is-orb"
                        style={{ width: 34, height: 34, flexShrink: 0 }}
                      >
                        <GenerativeAvatar seed={m.senderUsername} className="orb-art" />
                      </Link>
                      <div>
                        <div>
                          <Link
                            className="name"
                            href={`/u/${m.senderUsername}`}
                            style={{ textDecoration: "none" }}
                          >
                            {m.senderUsername}
                          </Link>{" "}
                          <span className="time">
                            {new Date(m.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="post-body">{m.content}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="composer" style={{ marginTop: 12 }}>
                  <input
                    className="field"
                    placeholder={t("placeholder")}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send();
                    }}
                  />
                  <button
                    className="btn btn-violet"
                    onClick={send}
                    disabled={sending || draft.trim() === ""}
                  >
                    {t("send")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

export default MessagesClient;
