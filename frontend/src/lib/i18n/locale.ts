/**
 * tikimiki i18n — locale primitives.
 *
 * English is the default/main language; Serbian is the alternative. The whole
 * existing Serbian copy becomes the "sr" translation. Each component owns its
 * own messages (a co-located object keyed by id with { en, sr }) and renders
 * them through the useT hook — so translations are componentized, not a single
 * global blob. System/chrome strings are translated; hardcoded example content
 * (feed posts, chat messages, sample names) stays in Serbian on purpose.
 */

export type Locale = "en" | "sr";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { id: Locale; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "sr", label: "Serbian", native: "Srpski" },
];

export const LOCALE_STORAGE_KEY = "tikimiki-locale";

/** A component's message table: { key: { en, sr } }. */
export type Messages = Record<string, Record<Locale, string>>;

/** Inline script (runs pre-hydration) that sets <html lang> from storage. */
export const localeInitScript = `(function(){try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');if(l!=='sr'&&l!=='en')l='${DEFAULT_LOCALE}';document.documentElement.setAttribute('lang',l);}catch(e){document.documentElement.setAttribute('lang','${DEFAULT_LOCALE}');}})();`;
