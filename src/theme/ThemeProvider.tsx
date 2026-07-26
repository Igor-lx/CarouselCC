// See ./README.md
import { useEffect, useState, type ReactNode } from "react";

import { ThemeContext } from "./ThemeContext";
import {
  BROWSER_THEME_COLORS,
  THEME_STORAGE_KEY,
  ON_SCREEN_MODES,
  THEME_MODES,
} from "./constants";
import type { OnScreenThemeMode, ThemeMode } from "./types";

/** Untrusted storage: anything but an explicit known mode resolves to AUTO. */
const asThemeMode = (raw: string | null): ThemeMode =>
  raw === THEME_MODES.LIGHT ||
  raw === THEME_MODES.DARK ||
  raw === THEME_MODES.AUTO
    ? raw
    : THEME_MODES.AUTO;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    asThemeMode(localStorage.getItem(THEME_STORAGE_KEY)),
  );

  const [onScreenTheme, setOnScreenTheme] = useState<OnScreenThemeMode>(
    ON_SCREEN_MODES.DARK,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const next: OnScreenThemeMode =
        theme === THEME_MODES.AUTO
          ? query.matches
            ? ON_SCREEN_MODES.DARK
            : ON_SCREEN_MODES.LIGHT
          : (theme as OnScreenThemeMode);

      setOnScreenTheme(next);
      document.documentElement.setAttribute("data-theme", next);
      // Keep the boot script's inline <html> background in sync — mobile chrome
      // samples it and the inline value outranks the stylesheet (see README).
      document.documentElement.style.backgroundColor =
        BROWSER_THEME_COLORS[next];
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    };

    apply();
    if (theme === THEME_MODES.AUTO) {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
  }, [theme]);

  useEffect(() => {
    // theme-color metas: in auto mode each keeps its own scheme's color (the
    // browser switches with the OS); an explicit choice overrides both.
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (metas.length === 0) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", BROWSER_THEME_COLORS[onScreenTheme]);
      document.head.appendChild(meta);
      return;
    }
    metas.forEach((meta) => {
      if (theme === THEME_MODES.AUTO) {
        const scheme = meta.getAttribute("media")?.includes("dark")
          ? ON_SCREEN_MODES.DARK
          : ON_SCREEN_MODES.LIGHT;
        meta.setAttribute("content", BROWSER_THEME_COLORS[scheme]);
      } else {
        meta.setAttribute("content", BROWSER_THEME_COLORS[onScreenTheme]);
      }
    });
  }, [theme, onScreenTheme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setTheme(asThemeMode(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = () => {
    setTheme(
      onScreenTheme === ON_SCREEN_MODES.LIGHT
        ? THEME_MODES.DARK
        : THEME_MODES.LIGHT,
    );
  };

  return (
    <ThemeContext.Provider value={{ theme, onScreenTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
