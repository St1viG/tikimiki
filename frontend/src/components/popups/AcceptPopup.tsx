"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * AcceptPopup — inline confirmation shown when a team-join request is accepted.
 *
 * Replaces the `.notif-actions` block for that notification after the user
 * clicks "Accept". Renders the quiet green "Accepted" reveal with the
 * check icon and a slide-up animation (nf-done-in from notifications.css).
 */

const M = {
  accepted: { en: "Accepted", sr: "Prihvaćeno" },
} as const;

export function AcceptPopup() {
  const t = useT(M);
  return (
    <div className="notif-done">
      <Icon name="check" />
      {t("accepted")}
    </div>
  );
}

export default AcceptPopup;
