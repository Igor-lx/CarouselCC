import { useEffect, useState, type ReactNode } from "react";

import { THEME_STORAGE_KEY, ThemeContext } from "./ThemeContext";
import {
  BROWSER_THEME_COLORS,
  ON_SCREEN_MODES,
  THEME_MODES,
  type OnScreenThemeMode,
  type ThemeMode,
} from "./types";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(
    () =>
      (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) ?? THEME_MODES.AUTO,
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
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    };

    apply();
    if (theme === THEME_MODES.AUTO) {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
  }, [theme]);

  useEffect(() => {
    const colour = BROWSER_THEME_COLORS[onScreenTheme];
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", colour);
  }, [onScreenTheme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setTheme((event.newValue as ThemeMode) ?? THEME_MODES.AUTO);
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
