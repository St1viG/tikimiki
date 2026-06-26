"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

/**
 * Theme system — four token themes driven by `html[data-theme]`.
 *
 * The actual colors live in globals.css as token overrides; this just owns the
 * active id, persists it to localStorage, and writes the attribute so the whole
 * UI re-skins live. A tiny inline script in the root layout applies the saved
 * theme BEFORE paint, so there is no flash; this provider then syncs React state
 * to whatever that script set.
 */

export type ThemeId = "default" | "mono" | "light" | "light-mono";

export interface ThemeMeta {
  id: ThemeId;
  /** creative display name */
  name: string;
  /** short descriptor (Serbian) */
  tag: string;
  /** preview swatch colors */
  sw: { bg: string; surface: string; line: string; accent: string; violet: string; ink: string };
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: "default",
    name: "Midnight Voltage",
    tag: "Tamna · original",
    sw: { bg: "#07060F", surface: "#100D22", line: "#2B2552", accent: "#ECE23A", violet: "#B49BFF", ink: "#EDE9FF" },
  },
  {
    id: "mono",
    name: "Noir",
    tag: "Tamna · crno-bela",
    sw: { bg: "#040405", surface: "#101012", line: "#2E2E34", accent: "#F2F2F4", violet: "#C6C6D0", ink: "#F4F4F6" },
  },
  {
    id: "light",
    name: "Svitanje",
    tag: "Svetla · violet",
    sw: { bg: "#F4F2FC", surface: "#FFFFFF", line: "#DAD3EF", accent: "#6E54B5", violet: "#6E54B5", ink: "#191430" },
  },
  {
    id: "light-mono",
    name: "Papir",
    tag: "Svetla · crno-bela",
    sw: { bg: "#F5F5F7", surface: "#FFFFFF", line: "#DBDBE0", accent: "#1C1C20", violet: "#5A5A63", ink: "#15151A" },
  },
];

export const THEME_STORAGE_KEY = "tikimiki-theme";
const VALID = new Set<ThemeId>(["default", "mono", "light", "light-mono"]);

/** The script string injected in <head> to apply the saved theme pre-paint. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(!t||['default','mono','light','light-mono'].indexOf(t)<0)t='default';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','default');}})();`;

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("default");

  // Sync React state with whatever the pre-paint script applied.
  useEffect(() => {
    const fromDom = document.documentElement.getAttribute("data-theme");
    if (fromDom && VALID.has(fromDom as ThemeId)) {
      setThemeState(fromDom as ThemeId);
    }
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* storage may be unavailable; theme still applies for the session */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export default ThemeProvider;
