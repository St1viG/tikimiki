"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedPost } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { OrbArt } from "@/components/ui/OrbArt";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  getFriends,
  sendDirectMessage,
  startConversation,
  type SocialUser,
} from "@/lib/api";
import { personName } from "@/lib/displayName";
import "./SharePopup.css";

/**
 * SharePopup — share a post: copy its permalink, or send it to a friend as a
 * direct message. Friends load on open (GET /social/friends); sending opens (or
 * reuses) the 1:1 conversation and posts the post link into it.
 */

const M = {
  title: { en: "Share post", sr: "Podeli objavu" },
  close: { en: "Close", sr: "Zatvori" },
  copyLink: { en: "Copy link", sr: "Kopiraj link" },
  copied: { en: "Link copied", sr: "Link kopiran" },
  sendToFriends: { en: "Send to friends", sr: "Pošalji prijateljima" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  noFriends: { en: "No friends to share with yet.", sr: "Još nemaš prijatelje za deljenje." },
  send: { en: "Send", sr: "Pošalji" },
  sending: { en: "Sending…", sr: "Slanje…" },
  sent: { en: "Sent", sr: "Poslato" },
} as const;

type SendState = "idle" | "sending" | "sent";

export function SharePopup({
  post,
  open,
  onClose,
}: {
  post: FeedPost | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT(M);
  const [friends, setFriends] = useState<SocialUser[] | null>(null);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (!post) return "";
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/?post=${post.postId}`;
  }, [post]);

  // Load friends + reset transient state each time the popup opens.
  useEffect(() => {
    if (!open) return;
    setFriends(null);
    setSendStates({});
    setCopied(false);
    let cancelled = false;
    getFriends()
      .then((list) => !cancelled && setFriends(list))
      .catch(() => !cancelled && setFriends([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !post) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const sendToFriend = async (friend: SocialUser) => {
    if (sendStates[friend.userId]) return; // sending or already sent
    setSendStates((s) => ({ ...s, [friend.userId]: "sending" }));
    try {
      const convId = await startConversation(friend.userId);
      await sendDirectMessage(convId, link);
      setSendStates((s) => ({ ...s, [friend.userId]: "sent" }));
    } catch (err) {
      console.error(err);
      setSendStates((s) => ({ ...s, [friend.userId]: "idle" }));
    }
  };

  return (
    <div
      className="sh-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sh-modal">
        <div className="sh-head">
          <h2 className="sh-title">{t("title")}</h2>
          <button className="sh-close" onClick={onClose} aria-label={t("close")}>
            <Icon name="x" />
          </button>
        </div>

        <div className="sh-link-row">
          <span className="sh-link" title={link}>
            {link}
          </span>
          <button className="btn btn-violet sh-copy" onClick={copyLink}>
            <Icon name={copied ? "check" : "link"} />
            {copied ? t("copied") : t("copyLink")}
          </button>
        </div>

        <div className="sh-section-label">{t("sendToFriends")}</div>
        <div className="sh-friends">
          {friends === null ? (
            <p className="sh-empty">{t("loading")}</p>
          ) : friends.length === 0 ? (
            <p className="sh-empty">{t("noFriends")}</p>
          ) : (
            friends.map((f) => {
              const state = sendStates[f.userId] ?? "idle";
              return (
                <div className="sh-friend" key={f.userId}>
                  <span className="sh-av is-orb" aria-hidden="true">
                    <OrbArt url={f.avatarUrl} seed={f.username} />
                  </span>
                  <span className="sh-friend-text">
                    <span className="sh-friend-name">{personName(f)}</span>
                    <span className="sh-friend-handle">@{f.username}</span>
                  </span>
                  <button
                    className={`btn ${state === "sent" ? "btn-ghost" : "btn-violet"} sh-send`}
                    disabled={state !== "idle"}
                    onClick={() => sendToFriend(f)}
                  >
                    {state === "sent" ? (
                      <>
                        <Icon name="check" /> {t("sent")}
                      </>
                    ) : state === "sending" ? (
                      t("sending")
                    ) : (
                      t("send")
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default SharePopup;
