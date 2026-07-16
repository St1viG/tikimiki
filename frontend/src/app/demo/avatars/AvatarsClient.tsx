"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { AVATAR_VARIANTS, type AvatarVariantEntry } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * /demo/avatars — generative-avatar comparison gallery.
 *
 * A "use client" component (it carries a live seed input that re-renders every
 * preview as you type). Wrapped in <AppShell variant="no-right"> so it wears
 * the normal app chrome. Lets the team judge all five default-avatar styles
 * side by side: at real UI sizes, in both circular and rounded-square masks,
 * across many seeds (uniqueness), and in a profile-mini context (in situ).
 *
 * Determinism note: same seed => identical art.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Generative avatars", sr: "Generativni avatari" },
  pageSub: { en: "Demo · default profile avatars", sr: "Demo · podrazumevani avatari profila" },
  introP: {
    en: "These are the default avatars — not an initial, but a unique generative image for each profile. Everything is deterministic: the same seed (user ID or @handle) always yields the same avatar, on all devices and on every load. Different profiles get visibly different art. Enter a seed below to compare all five styles live.",
    sr: "Ovo su podrazumevani avatari — nije inicijal, već jedinstvena generativna sličica za svaki profil. Sve je deterministički: isti seed (ID korisnika ili @handle) uvek daje isti avatar, na svim uređajima i pri svakom učitavanju. Različiti profili dobijaju vidno drugačiju umetnost. Upiši seed ispod da uživo uporediš svih pet stilova.",
  },
  seedLabel: { en: "Seed (e.g. @handle)", sr: "Seed (npr. @handle)" },
  circleShape: { en: "Circle (border-radius 50%)", sr: "Krug (border-radius 50%)" },
  roundedShape: { en: "Rounded square (radius 18px)", sr: "Zaobljeni kvadrat (radius 18px)" },
  uniquenessStrip: {
    en: "Different profiles (same style, different seed)",
    sr: "Različiti profili (isti stil, drugi seed)",
  },
  inContext: { en: "In context (profile-mini, 40px)", sr: "U kontekstu (profil-mini, 40px)" },
} as const;

/** Sample handles so uniqueness across profiles is obvious at a glance. */
const SAMPLE_SEEDS: readonly string[] = [
  "andrej",
  "stiveng",
  "nenad",
  "dimitrije",
  "miki",
  "tiki",
  "mara",
  "moljac",
  "fenjer",
  "etf",
  "garaza",
  "lumen",
  "vatra",
  "kvant",
];

/** Real UI sizes the avatar must look right at. */
const UI_SIZES: readonly number[] = [40, 44, 72, 120];

/** One-line Serbian description per style, shown in each card header. */
const VARIANT_DESC: Record<string, string> = {
  grid: "Identikon mreža 5×5 piksela sa simetrijom",
  hex: "Brušeni dragulj — heksagon sa fasetama",
  gradient: "Mirna aurora — gradijent i meki sjaj",
  circuit: "Štampana ploča sa munjom u centru",
  orbit: "Sazvežđe — centar i sateliti kao graf tima",
};

/** A name to pair with a handle in the in-situ profile-mini row. */
function nameFor(handle: string): string {
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

function VariantCard({
  entry,
  seed,
  circleLabel,
  roundedLabel,
  uniquenessLabel,
  inContextLabel,
}: {
  entry: AvatarVariantEntry;
  seed: string;
  circleLabel: string;
  roundedLabel: string;
  uniquenessLabel: string;
  inContextLabel: string;
}) {
  const Avatar = entry.component;
  const situHandle = SAMPLE_SEEDS[0];

  return (
    <section className="card av-card" aria-labelledby={`av-${entry.id}`}>
      <div className="av-card-h">
        <h2 id={`av-${entry.id}`}>{entry.label}</h2>
        <code className="av-id">{entry.id}</code>
        <span className="av-desc">{VARIANT_DESC[entry.id]}</span>
      </div>

      <div className="av-card-body">
        {/* (a) Size + corner-shape matrix — circular vs rounded square. */}
        <div className="av-shapes">
          <div className="av-shape-col">
            <p className="av-sub">{circleLabel}</p>
            <div className="av-sizes">
              {UI_SIZES.map((s) => (
                <figure className="av-size" key={`c-${s}`}>
                  <span className="av-frame circle" style={{ width: s, height: s }}>
                    <Avatar seed={seed} size={s} />
                  </span>
                  <figcaption>{s}px</figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="av-shape-col">
            <p className="av-sub">{roundedLabel}</p>
            <div className="av-sizes">
              {UI_SIZES.map((s) => (
                <figure className="av-size" key={`r-${s}`}>
                  <span className="av-frame rounded" style={{ width: s, height: s }}>
                    <Avatar seed={seed} size={s} />
                  </span>
                  <figcaption>{s}px</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>

        {/* (b) Uniqueness strip — many seeds, one style. */}
        <div>
          <p className="av-sub">{uniquenessLabel}</p>
          <div className="av-strip">
            {SAMPLE_SEEDS.map((s) => (
              <div className="av-strip-item" key={s}>
                <span className="av-frame">
                  <Avatar seed={s} size={48} />
                </span>
                <span title={`@${s}`}>@{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* In-situ: mimics the left-rail profile-mini (avatar + name + @handle). */}
        <div>
          <p className="av-sub">{inContextLabel}</p>
          <div className="av-situ">
            <span className="av-frame">
              <Avatar seed={situHandle} size={40} />
            </span>
            <span className="av-meta">
              <span className="av-name">{nameFor(situHandle)} Čolić</span>
              <span className="av-handle">@{situHandle}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AvatarsClient() {
  const router = useRouter();
  const t = useT(M);
  const [seed, setSeed] = useState("andrej");

  return (
    <AppShell variant="no-right">
      <main id="main" className="page">
        <div className="page-head">
          <button
            type="button"
            className="col-back"
            aria-label={t("backLabel")}
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div className="col-titles">
            <h1 className="page-title">{t("pageTitle")}</h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        <div className="av-gallery">
          <div className="card av-card">
            <div className="av-card-body av-intro">
              <p>{t("introP")}</p>

              <div className="av-seed">
                <label htmlFor="av-seed-input">{t("seedLabel")}</label>
                <input
                  id="av-seed-input"
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="andrej"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          {AVATAR_VARIANTS.map((entry) => (
            <VariantCard
              key={entry.id}
              entry={entry}
              seed={seed}
              circleLabel={t("circleShape")}
              roundedLabel={t("roundedShape")}
              uniquenessLabel={t("uniquenessStrip")}
              inContextLabel={t("inContext")}
            />
          ))}
        </div>
      </main>
    </AppShell>
  );
}

export default AvatarsClient;
