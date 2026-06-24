# tikimiki frontend — Foundation Contract

This is the shared skeleton every page agent builds on. Follow it exactly. Do
NOT edit any file listed under "shared (do not edit)"; create only your own route
files, co-located CSS, and page-local components.

## (a) File tree created under `frontend/`

```
frontend/
  package.json            next 14.2.5 · react 18.3.1 · clsx ^2.1.1 · TS strict
  tsconfig.json           strict, moduleResolution "bundler", paths @/* -> ./src/*
  next.config.mjs         export default { images: { unoptimized: true } }
  next-env.d.ts
  .eslintrc.json          { "extends": "next/core-web-vitals" }
  .gitignore
  CONTRACT.md             (this file)
  public/images/          group_photo.jpg · etf2.jpg · cat.gif · favicon.ico
  src/
    app/
      favicon.ico         App Router favicon convention
      globals.css         app.css VERBATIM — imported once by layout.tsx
      layout.tsx          <html lang="sr"> + fonts + Sprite + grain + skip-link
      page.tsx            HOME FEED (server, metadata "tikimiki: feed")
      FeedClient.tsx      "use client" — interactive feed (tabs + like toggles)
      home.css            home_page.html <style> block VERBATIM (co-located)
    styles/
      cohor.css           cohor.css VERBATIM — import only in the /cohor layout
    components/
      Sprite.tsx          injects the icon <symbol> sprite (server)
      Icon.tsx            <Icon name className /> -> <svg class="ic …"><use/></svg>
      shell/
        AppShell.tsx      shell grid + RailLeft + right slot
        RailLeft.tsx      "use client" locked left nav (active via usePathname)
        RailRight.tsx     default right rail (search + Cohor card + DMs + footer)
      ui/
        Button.tsx  Badge.tsx  Avatar.tsx  Card.tsx
    lib/
      types.ts            domain types + enums (from DB schema v4.1)
      mock-data.ts        read-only Serbian sample data
      format.ts           formatNumber · formatPoints · formatRelativeTime
```

Shared (DO NOT EDIT): everything under `src/components/`, `src/lib/`,
`src/styles/`, `src/app/globals.css`, `src/app/layout.tsx`. You may import from
them freely.

## (b) Import paths + prop signatures

```ts
// Icons (requires <Sprite/>, already in layout)
import { Icon } from "@/components/Icon";
//  Icon({ name: string; className?: string })
//  base "ic" class + aria-hidden added for you. Extra classes -> className:
//  <Icon name="like" className="heart" />  ·  <Icon name="search" className="ic-sm" />

// App shell
import { AppShell } from "@/components/shell/AppShell";
//  AppShell({ children: ReactNode; right?: ReactNode;
//             variant?: "default" | "no-right" | "wide" })   // default "default"
import { RailLeft } from "@/components/shell/RailLeft";    // RailLeft()  (no props)
import { RailRight } from "@/components/shell/RailRight";  // RailRight() (no props)

// UI primitives (optional — raw className markup is equally valid)
import { Button } from "@/components/ui/Button";
//  Button({ variant?: "primary"|"secondary"|"violet"|"ghost"|"danger";  // def "primary"
//           href?: string; className?; ...button|anchor props; children })
//  href set -> renders next/link <Link class="btn btn-…">; else <button>.
import { Badge } from "@/components/ui/Badge";
//  Badge({ variant: "live"|"upcoming"|"open"|"ended"|"closed"|"warn";
//          dot?: boolean; className?; children })
//  leading .badge-dot auto-added for live/upcoming/ended/closed (per app.css).
import { Avatar } from "@/components/ui/Avatar";
//  Avatar({ kind: "brand"|"v"|"t"|"org"; className?; children })  // initials chip
import { Card } from "@/components/ui/Card";
//  Card({ className?; ...section props; children })  // <section className="card …">
```

## (c) AppShell children contract — UNAMBIGUOUS

AppShell renders, in order: the `.shell` grid `<div>`, then `<RailLeft/>`, then
**your `{children}` exactly as given**, then (default variant only) the right
column. **AppShell does NOT wrap your content in a `<main>`. The PAGE supplies
its own `<main>…</main>`** so it controls the tag, classes and id (e.g.
`className="feed" id="feed"` for the feed, or whatever the prototype root used).
Pick `variant` from the prototype's `.shell` root class: `class="shell"` →
`"default"` (pass right rail), `class="shell no-right"` → `"no-right"`,
`class="shell wide"` → `"wide"`. For default, pass page-specific right content
via `right`, or omit it to get `<RailRight/>`.

```tsx
// Typical app-shell page:
<AppShell right={<RailRight />}>
  <main className="feed" id="feed">…page content…</main>
</AppShell>
// No-right page:  <AppShell variant="no-right"><main className="page">…</main></AppShell>
```

Full-screen pages (login, signup, signup/organization, suspended, cohor) do NOT
use AppShell — return the prototype inner content directly. Never re-add the
sprite, grain div, or skip-link (the root layout provides them globally).

## (d) Exports of lib/mock-data.ts and lib/types.ts

`lib/mock-data.ts` (read-only; do not mutate):
- `currentUser: User` — Andrej Čolić, @andrej, initials "AČ", avatarKind "brand".
- `currentMember: Member` — `{ userId, points: 1240 }`.
- `navBadges` — `{ notifications: 5, store: 2 } as const`.
- `organizations: Organization[]` — ETF HackWeek, Garaža.
- `hackathons: Hackathon[]` — ETF HackWeek 2026 (Beograd, $2,000, 14–16. jun,
  spotsLeft 14), Garaža Hackathon 2026 (Novi Sad, $1,500, 5–7. jul).
- `feedPosts: Post[]` — the 4 home-feed entries (2 promos + fenjer + Mohammed
  Avdol w/ group_photo), with display fields + `feed` filter key.
- `cohorCard` — `{ unreadTotal, server: { initials, name, subtitle, unread } } as const`.
- `dmThreads: DmThread[]` — digitalci (7), Nenad Skoković (1).

`lib/types.ts` exports (camelCase fields; ids `string` UUID; timestamps ISO
`string`; nullable cols `?: T | null`):
- Enums (string-literal unions): `OrgVerificationStatus`, `HackathonType`,
  `HackathonStatus`, `TeamRole`, `ApplicationStatus`, `ProjectStatus`,
  `ChannelType`, `BadgeCategory`, `CosmeticType`, `CosmeticRarity`,
  `MerchOrderStatus`, `SubscriptionPlan`, `SubscriptionStatus`,
  `ReportTargetType`, `ReportStatus`, `EntityType`, `NotificationType`.
- Presentation unions: `AvatarKind` = "brand"|"v"|"t"|"org";
  `BadgeVariant` = "live"|"upcoming"|"open"|"ended"|"closed"|"warn".
- Interfaces: `User`, `Member`, `Organization`, `Skill`, `Hackathon`, `Team`,
  `TeamMember`, `Application`, `Project`, `PostAttachment`, `Post`, `Comment`,
  `Message`, `Channel`, `Server`, `Badge`, `UserBadge`, `Notification`,
  `MerchItem`, `CosmeticItem`, `DmThread`, `LeaderboardEntry`.
  (Entity interfaces carry a few optional display fields — e.g. User.initials /
  avatarKind, Hackathon.prizePool / dateLabel / spotsLeft, Post.author* /
  likeCount / promoted / hackathon / feed — for direct rendering.)

## (e) Icon names available in the sprite (use as `<Icon name="…"/>`, no `i-` prefix)

home, hackathon, teams, leaderboard, messages, bell, cart, gamehub, settings,
premium, location, calendar, trophy, like, like-fill, comment, share, more,
server, search, plus, check, x, clock, coin, flame, shield, logout, mail, lock,
chevron-down, arrow-left, image, link, flag, github, zap, award, upload,
external, eye, star, rocket, edit, trash, sparkles.

## (f) Server-page + client-child title pattern (reminder)

`"use client"` cannot export `metadata`. For any interactive page, keep a tiny
SERVER `page.tsx` that does `export const metadata = { title: "<original <title>
text>" }` and renders a co-located `"use client"` child (e.g. `<RouteClient/>`)
holding all markup + state (useState/useRef/useEffect, event handlers). Copy the
prototype's `<style>` block VERBATIM into a co-located `*.css` and import it at
the top of `page.tsx`. The home route (`page.tsx` + `FeedClient.tsx` + `home.css`)
is the reference implementation — mirror it. Purely static pages need only a
single server `page.tsx` with a `metadata` export.

## Conversion rules quick-reference

- Never output `<html>/<head>/<body>`, the sprite, grain, or skip-link in a page.
- Preserve ALL Serbian copy and EVERY className byte-for-byte. Never rename a class.
- JSX: class→className, for→htmlFor, tabindex→tabIndex, inline
  `style="a:b"`→`style={{ a: "b" }}`, self-close void tags, keep aria-*/role.
  CSS custom props in style need `as React.CSSProperties` (see FeedClient `--i`).
- Icons: `<svg class="ic …"><use href="#i-NAME"/></svg>` → `<Icon name="NAME"
  className="…extra ic classes…" />`.
- Internal links: `<Link href="/route">` from "next/link". Route map:
  home_page→/ · login→/login · signup→/signup · signup_organization→
  /signup/organization · suspended→/suspended · hackathons→/hackathons ·
  hackathons_admin→/hackathons/manage · teams→/teams · teams_not_in_team→
  /teams/find · leaderboard→/leaderboard · notifications→/notifications ·
  store→/store · gamehub→/gamehub · premium→/premium · settings→/settings ·
  admin_panel→/admin · moderator_panel→/moderator · applications→/applications ·
  cohor→/cohor · profile_popup→/profile. In-page `#id` and external/http links
  stay plain `<a>`.
- Images: `images/x.jpg` → `/images/x.jpg` (served from public/). Keep
  loading="lazy" and alt.
```
