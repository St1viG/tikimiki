"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrbArt } from "@/components/ui/OrbArt";

export interface MentionCandidate {
  userId?: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface Options {
  /** The textarea/input the user types into. */
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /** Current controlled value of that input. */
  value: string;
  /** Setter for the controlled value (the picked handle is spliced in). */
  setValue: (v: string) => void;
  /** Resolve candidates for the current `@query` (sync members or async fetch). */
  search: (query: string) => MentionCandidate[] | Promise<MentionCandidate[]>;
  enabled?: boolean;
  /** Open the menu above ("up", default — composer at page bottom) or below
   *  ("down" — composer near the top, where an upward menu would clip). */
  placement?: "up" | "down";
}

// An active mention token is `@…` right before the caret, started by line-start
// or a separator (so emails / mid-word @ don't trigger it).
const TOKEN_RE = /(?:^|[\s(])@([a-zA-Z0-9_.-]{0,32})$/;

/**
 * Headless @-mention autocomplete for a controlled textarea/input. Returns a
 * `menu` to render inside a `position: relative` ancestor, plus an `onKeyDown`
 * the host should call first (it returns `true` when it consumed the key, so
 * the host can skip its own Enter/Tab handling).
 */
export function useMentionAutocomplete({
  inputRef,
  value,
  setValue,
  search,
  enabled = true,
  placement = "up",
}: Options) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentionCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const startRef = useRef(0); // index of the active '@'
  const reqRef = useRef(0); // guards against out-of-order async results
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setItems([]);
    setIndex(0);
  }, []);

  // Detect the active token before the caret whenever the value changes.
  useEffect(() => {
    if (!enabled) return;
    const el = inputRef.current;
    if (!el || document.activeElement !== el) return;
    const caret = el.selectionStart ?? value.length;
    const m = TOKEN_RE.exec(value.slice(0, caret));
    if (!m) {
      close();
      return;
    }
    const query = m[1];
    startRef.current = caret - query.length - 1;
    const reqId = ++reqRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await Promise.resolve(search(query));
      if (reqId !== reqRef.current) return; // discard stale async results so fast typing never shows old candidates
      setItems(res);
      setIndex(0);
      setOpen(res.length > 0);
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);

  const accept = useCallback(
    (cand: MentionCandidate) => {
      const el = inputRef.current;
      const caret = el?.selectionStart ?? value.length;
      const before = value.slice(0, startRef.current);
      const after = value.slice(caret);
      const insert = `@${cand.username} `;
      setValue(before + insert + after);
      close();
      const pos = before.length + insert.length;
      requestAnimationFrame(() => {
        el?.focus();
        try {
          el?.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    },
    [value, setValue, close, inputRef],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!open || items.length === 0) return false;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setIndex((i) => (i + 1) % items.length);
          return true;
        case "ArrowUp":
          e.preventDefault();
          setIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        case "Enter":
        case "Tab":
          e.preventDefault();
          accept(items[index]);
          return true;
        case "Escape":
          e.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [open, items, index, accept, close],
  );

  const menu =
    open && items.length > 0 ? (
      <ul className={`mention-menu mention-menu--${placement}`} role="listbox">
        {items.map((c, i) => (
          <li key={c.userId ?? c.username} role="option" aria-selected={i === index}>
            <button
              type="button"
              className={`mention-opt${i === index ? " is-active" : ""}`}
              // mousedown fires before the textarea's blur, keeping focus so setSelectionRange works.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(c);
              }}
              onMouseEnter={() => setIndex(i)}
            >
              <span className="mention-av is-orb" aria-hidden="true">
                <OrbArt url={c.avatarUrl ?? null} seed={c.username} />
              </span>
              <span className="mention-opt-text">
                {c.displayName && <span className="mention-opt-name">{c.displayName}</span>}
                <span className="mention-opt-handle">@{c.username}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return { onKeyDown, menu, open };
}
