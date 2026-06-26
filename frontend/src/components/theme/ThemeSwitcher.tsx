"use client";

import { Icon } from "@/components/Icon";
import { THEMES, type ThemeId, useTheme } from "./ThemeProvider";
import { useT } from "@/components/i18n/LanguageProvider";
import "./theme-switcher.css";

/**
 * ThemeSwitcher — a grid of selectable theme cards (live-applies on click).
 *
 * Each card shows the theme's creative name (a proper noun, left untranslated),
 * a localized descriptor tag and a mini mock-UI swatch (floor + surface chip +
 * accent + violet) rendered in that theme's actual colors, so the choice is
 * visual. Lives in Settings → Theme.
 */
const M = {
  themeTitle: { en: "Site theme", sr: "Tema sajta" },
  tagDefault: { en: "Dark · original", sr: "Tamna · original" },
  tagMono: { en: "Dark · black & white", sr: "Tamna · crno-bela" },
  tagLight: { en: "Light · violet", sr: "Svetla · violet" },
  tagLightMono: { en: "Light · black & white", sr: "Svetla · crno-bela" },
} as const;

const TAG_KEY: Record<ThemeId, keyof typeof M> = {
  default: "tagDefault",
  mono: "tagMono",
  light: "tagLight",
  "light-mono": "tagLightMono",
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useT(M);

  return (
    <div className="theme-grid" role="radiogroup" aria-label={t("themeTitle")}>
      {THEMES.map((entry) => {
        const active = theme === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-card${active ? " active" : ""}`}
            onClick={() => setTheme(entry.id)}
          >
            <span
              className="theme-preview"
              aria-hidden="true"
              style={{ background: entry.sw.bg, borderColor: entry.sw.line }}
            >
              <span
                className="theme-preview-card"
                style={{ background: entry.sw.surface, borderColor: entry.sw.line }}
              >
                <span className="theme-dot" style={{ background: entry.sw.violet }} />
                <span className="theme-bar" style={{ background: entry.sw.ink, opacity: 0.55 }} />
              </span>
              <span className="theme-accent" style={{ background: entry.sw.accent }} />
            </span>

            <span className="theme-meta">
              <span className="theme-name">{entry.name}</span>
              <span className="theme-tag">{t(TAG_KEY[entry.id])}</span>
            </span>

            <span className="theme-check" aria-hidden="true">
              {active && <Icon name="check" className="ic-sm" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ThemeSwitcher;
