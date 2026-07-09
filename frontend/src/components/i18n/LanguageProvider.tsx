"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { type Locale, type Messages, DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "@/lib/i18n/locale";

/**
 * LanguageProvider — owns the active locale (default English), persists it to
 * localStorage and keeps <html lang> in sync. Components read it via useT().
 *
 * A tiny inline script in the root layout sets <html lang> before paint; this
 * provider then syncs React state to the saved locale.
 */

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "sr" || saved === "en") setLocaleState(saved);
    } catch {
      /* storage unavailable; default locale stands */
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("lang", l);
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/**
 * useT — bind a component's local messages to the active locale.
 *
 *   const M = { post: { en: "Post", sr: "Objavi" } } as const;
 *   const t = useT(M);
 *   <button>{t("post")}</button>
 *
 * Falls back to English, then to the key itself, if a translation is missing.
 */
export function useT<M extends Messages>(messages: M) {
  const { locale } = useLanguage();
  return (key: keyof M): string =>
    messages[key as string]?.[locale] ?? messages[key as string]?.en ?? String(key);
}

export default LanguageProvider;
