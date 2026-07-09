"use client";

import { createContext, useContext } from "react";
import Link from "next/link";

/**
 * Lets a host decide what a mention click does. When a provider supplies a
 * handler (e.g. open a profile popup), mentions become buttons that call it;
 * with no provider they fall back to navigating to the profile route.
 */
export const MentionClickContext = createContext<((username: string) => void) | null>(null);

export function MentionLink({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const onClick = useContext(MentionClickContext);
  if (onClick) {
    return (
      <button
        type="button"
        className="mention"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(username);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <Link href={`/u/${username}`} className="mention">
      {children}
    </Link>
  );
}

export default MentionLink;
