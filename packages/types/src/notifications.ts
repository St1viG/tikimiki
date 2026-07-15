/**
 * Bilingual notification templates — single source of truth for notification
 * copy, shared by the backend (composes the stored Serbian fallback text) and
 * the frontend (renders in the viewer's active locale).
 *
 * A notification row stores `template: { key, params }`; `{param}` placeholders
 * in the strings below are substituted from `params`. Rows created before this
 * mechanism existed have `template = null` and render their stored title/body.
 */

export type NotificationLocale = "en" | "sr";

/** Values substituted into `{placeholder}` slots of a template string. */
export type NotificationTemplateParams = Record<string, string | number>;

/** What a notification row stores to allow locale-aware rendering. */
export interface NotificationTemplateRef {
  key: NotificationTemplateKey;
  params?: NotificationTemplateParams;
}

interface LocalizedText {
  en: string;
  sr: string;
}

interface NotificationTemplate {
  title: LocalizedText;
  body?: LocalizedText;
}

export const NOTIFICATION_TEMPLATES = {
  mention: {
    title: { en: "You were mentioned", sr: "Pomenuti ste" },
    body: { en: "@{username} mentioned you.", sr: "@{username} vas je pomenuo." },
  },
  new_direct_message: {
    title: { en: "New message", sr: "Nova poruka" },
    body: { en: "@{username}: {preview}", sr: "@{username}: {preview}" },
  },
  new_application: {
    title: { en: "New application", sr: "Nova prijava" },
    body: {
      en: 'A new user applied to your hackathon "{hackathonTitle}".',
      sr: 'Novi korisnik je aplicirao na vaš hakaton „{hackathonTitle}".',
    },
  },
  new_team_application: {
    title: { en: "New team application", sr: "Nova timska prijava" },
    body: {
      en: 'A team applied to your hackathon "{hackathonTitle}" (members: {memberCount}).',
      sr: 'Tim je aplicirao na vaš hakaton „{hackathonTitle}" (broj članova: {memberCount}).',
    },
  },
  application_approved: {
    title: { en: "Application approved", sr: "Prijava odobrena" },
    body: {
      en: "Your application for {hackathonTitle} was approved. 🎉",
      sr: "Tvoja prijava za {hackathonTitle} je odobrena. 🎉",
    },
  },
  application_rejected: {
    title: { en: "Application rejected", sr: "Prijava odbijena" },
    body: {
      en: "Your application for {hackathonTitle} was rejected.",
      sr: "Tvoja prijava za {hackathonTitle} je odbijena.",
    },
  },
  application_rejected_reason: {
    title: { en: "Application rejected", sr: "Prijava odbijena" },
    body: {
      en: "Your application for {hackathonTitle} was rejected. Reason: {reason}",
      sr: "Tvoja prijava za {hackathonTitle} je odbijena. Razlog: {reason}",
    },
  },
  new_follower: {
    title: { en: "New follower", sr: "Novi pratilac" },
    body: { en: "@{username} is now following you.", sr: "@{username} te sada prati." },
  },
  new_follower_anon: {
    title: { en: "New follower", sr: "Novi pratilac" },
    body: { en: "Someone is now following you.", sr: "Neko te sada prati." },
  },
  post_comment: {
    title: { en: "New comment", sr: "Novi komentar" },
    body: {
      en: "@{username} commented on your post.",
      sr: "@{username} je komentarisao tvoju objavu.",
    },
  },
  post_reaction: {
    title: { en: "New reaction", sr: "Nova reakcija" },
    body: { en: "@{username} liked your post.", sr: "@{username} je lajkovao tvoju objavu." },
  },
  post_reaction_anon: {
    title: { en: "New reaction", sr: "Nova reakcija" },
    body: { en: "Someone liked your post.", sr: "Neko je lajkovao tvoju objavu." },
  },
  task_assigned: {
    title: { en: "You've been assigned a task", sr: "Dodeljen vam je zadatak" },
    body: { en: "{cardTitle}", sr: "{cardTitle}" },
  },
  moderator_assigned: {
    title: { en: "You've been made a moderator", sr: "Dodeljena vam je uloga moderatora" },
    body: {
      en: 'You are now a moderator of "{hackathonTitle}".',
      sr: 'Postali ste moderator hakatona „{hackathonTitle}".',
    },
  },
  badge_awarded_grupe: {
    title: { en: "Badge earned: {badgeName}", sr: "Osvojen bedž: {badgeName}" },
    body: {
      en: "You solved all four groups without a single mistake!",
      sr: "Rešio/la si sve četiri grupe bez ijedne greške!",
    },
  },
  report_dismissed: {
    title: { en: "Report dismissed", sr: "Prijava odbačena" },
    body: {
      en: "Your report was reviewed. No rule violation was found.",
      sr: "Vaša prijava je pregledana. Nije pronađena povreda pravila.",
    },
  },
  report_resolved: {
    title: { en: "Report resolved", sr: "Prijava rešena" },
    body: {
      en: "Your report was reviewed and resolved.",
      sr: "Vaša prijava je pregledana i rešena.",
    },
  },
  report_resolved_removed: {
    title: { en: "Report resolved", sr: "Prijava rešena" },
    body: {
      en: "The reported content was removed.",
      sr: "Prijavljeni sadržaj je uklonjen.",
    },
  },
  report_resolved_banned: {
    title: { en: "Report resolved", sr: "Prijava rešena" },
    body: {
      en: "The reported user was banned.",
      sr: "Prijavljeni korisnik je banovan.",
    },
  },
  report_resolved_removed_banned: {
    title: { en: "Report resolved", sr: "Prijava rešena" },
    body: {
      en: "The reported content was removed and the user was banned.",
      sr: "Prijavljeni sadržaj je uklonjen, a korisnik je banovan.",
    },
  },
  hackathon_result_won: {
    title: { en: "You finished #{rank}!", sr: "Osvojili ste {rank}. mesto!" },
    body: {
      en: '{teamName} finished #{rank} — you earned {points} points and the "{badgeName}" badge.',
      sr: '{teamName} je osvojio/la {rank}. mesto — dobili ste {points} poena i bedž "{badgeName}".',
    },
  },
  hackathon_result_top3: {
    title: { en: "You finished #{rank}!", sr: "Osvojili ste {rank}. mesto!" },
    body: {
      en: "Check your placement and results on your profile.",
      sr: "Pogledaj svoj plasman i rezultate na profilu.",
    },
  },
  hackathon_result_posted: {
    title: { en: "Hackathon results are out", sr: "Rezultati hakatona su objavljeni" },
    body: {
      en: "Check your placement and results on your profile.",
      sr: "Pogledaj svoj plasman i rezultate na profilu.",
    },
  },
  bounty_result_posted: {
    title: {
      en: "You won a sponsor prize: {bountyTitle}",
      sr: "Osvojili ste sponzorsku nagradu: {bountyTitle}",
    },
    body: {
      en: '{sponsorName} rewarded you for "{bountyTitle}" — you earned {points} points and the "{badgeName}" badge.',
      sr: '{sponsorName} vas je nagradio/la za "{bountyTitle}" — dobili ste {points} poena i bedž "{badgeName}".',
    },
  },
  friend_request_received: {
    title: { en: "New friend request", sr: "Novi zahtev za prijateljstvo" },
    body: {
      en: "@{username} sent you a friend request.",
      sr: "@{username} ti je poslao zahtev za prijateljstvo.",
    },
  },
  friend_request_accepted: {
    title: { en: "Request accepted", sr: "Zahtev prihvaćen" },
    body: { en: "@{username} accepted your request.", sr: "@{username} je prihvatio tvoj zahtev." },
  },
  team_request_received: {
    title: { en: "New team request", sr: "Novi zahtev za tim" },
    body: {
      en: "@{username} wants to join team {teamName}.",
      sr: "@{username} želi da se priključi timu {teamName}.",
    },
  },
  team_request_received_anon: {
    title: { en: "New team request", sr: "Novi zahtev za tim" },
    body: {
      en: "Someone wants to join team {teamName}.",
      sr: "Neko želi da se priključi timu {teamName}.",
    },
  },
  team_request_accepted: {
    title: { en: "Request accepted", sr: "Zahtev prihvaćen" },
    body: {
      en: "Your request to join team {teamName} was accepted. 🎉",
      sr: "Tvoj zahtev za tim {teamName} je prihvaćen. 🎉",
    },
  },
  team_invitation_received: {
    title: { en: "Team invitation", sr: "Poziv u tim" },
    body: {
      en: "@{username} invited you to join team {teamName}.",
      sr: "@{username} te poziva u tim {teamName}.",
    },
  },
  team_invitation_received_anon: {
    title: { en: "Team invitation", sr: "Poziv u tim" },
    body: {
      en: "The team leader invited you to join team {teamName}.",
      sr: "Vođa tima te poziva u tim {teamName}.",
    },
  },
  team_invitation_declined: {
    title: { en: "Invitation declined", sr: "Poziv odbijen" },
    body: {
      en: "@{username} declined your invitation to join team {teamName}.",
      sr: "@{username} je odbio/la poziv u tim {teamName}.",
    },
  },
  team_invitation_declined_anon: {
    title: { en: "Invitation declined", sr: "Poziv odbijen" },
    body: {
      en: "An invited user declined your invitation to join team {teamName}.",
      sr: "Pozvani korisnik je odbio/la poziv u tim {teamName}.",
    },
  },
} as const satisfies Record<string, NotificationTemplate>;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

/** Substitute `{param}` slots; unknown slots are left verbatim. */
function interpolate(text: string, params: NotificationTemplateParams): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Render a notification template in the given locale. Returns null for an
 * unknown key (e.g. a newer server than client) so callers can fall back to
 * the stored title/body strings.
 */
export function renderNotification(
  key: string,
  params: NotificationTemplateParams | undefined,
  locale: NotificationLocale,
): { title: string; body: string | null } | null {
  const template = (NOTIFICATION_TEMPLATES as Record<string, NotificationTemplate>)[key];
  if (!template) return null;
  const p = params ?? {};
  return {
    title: interpolate(template.title[locale], p),
    body: template.body ? interpolate(template.body[locale], p) : null,
  };
}
