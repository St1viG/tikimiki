"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * DeclinePopup — inline confirmation shown when a team-join request is declined.
 *
 * Replaces the `.notif-actions` block for that notification after the user
 * clicks "Decline". Renders the quiet "Declined" reveal with the x icon
 * and a slide-up animation (nf-done-in from notifications.css).
 */

const M = {
  declined: { en: "Declined", sr: "Odbijeno" },
} as const;

export function DeclinePopup() {
  const t = useT(M);
  return (
    <div className="notif-done">
      <Icon name="x" />
      {t("declined")}
    </div>
  );
}

export default DeclinePopup;
