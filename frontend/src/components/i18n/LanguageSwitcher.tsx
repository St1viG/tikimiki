"use client";

import { Icon } from "@/components/Icon";
import { LOCALES } from "@/lib/i18n/locale";
import { useLanguage, useT } from "./LanguageProvider";
import "./lang-switcher.css";

/** Strings for the switcher itself (so it is bilingual too). */
const M = {
  english: { en: "English", sr: "Engleski" },
  serbian: { en: "Serbian", sr: "Srpski" },
} as const;

/**
 * LanguageSwitcher — a segmented English / Srpski control. Lives in
 * Settings → Language and applies instantly (persisted in localStorage).
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const t = useT(M);
  const label = (id: (typeof LOCALES)[number]["id"]) => (id === "en" ? t("english") : t("serbian"));

  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language">
      {LOCALES.map((l) => {
        const active = locale === l.id;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`lang-opt${active ? " active" : ""}`}
            onClick={() => setLocale(l.id)}
          >
            <span className="lang-code" aria-hidden="true">
              {l.id.toUpperCase()}
            </span>
            <span className="lang-name">{label(l.id)}</span>
            {active && (
              <span className="lang-check" aria-hidden="true">
                <Icon name="check" className="ic-sm" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
