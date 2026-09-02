// Portable theme STATE (no browser-chrome). See ./README.md
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useIsomorphicLayoutEffect } from "../hooks/useIsomorphicLayoutEffect";
import { ThemeContext } from "./internal/ThemeContext";
import {
  ON_SCREEN_MODES,
  THEME_MODES,
  THEME_STORAGE_KEY,
} from "./internal/constants";
import { asThemeMode, prefersDark, resolveOnScreen } from "./internal/resolve";
import { readStoredMode, writeStoredMode } from "./internal/storage";
import type {
  OnScreenThemeMode,
  ThemeContextValue,
  ThemeMode,
} from "./internal/types";

export function ThemeStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(readStoredMode);
  const [onScreenTheme, setOnScreenTheme] = useState<OnScreenThemeMode>(() =>
    resolveOnScreen(readStoredMode(), prefersDark()),
  );

  // Resolve → data-theme, tracking the OS while in auto. Layout-timed so the
  // first paint is already correct (even without the pre-paint boot script).
  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolveOnScreen(theme, query.matches);
      setOnScreenTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    apply();
    if (theme === THEME_MODES.AUTO) {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
  }, [theme]);

  useEffect(() => {
    writeStoredMode(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key === null` is `localStorage.clear()` — our setting went with it, so
      // the tab follows the system again instead of holding a mode nobody
      // stores any more. Any OTHER key belongs to some other app on this
      // origin and must not repaint us.
      if (event.key === null || event.key === THEME_STORAGE_KEY)
        setTheme(asThemeMode(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(
      onScreenTheme === ON_SCREEN_MODES.LIGHT
        ? THEME_MODES.DARK
        : THEME_MODES.LIGHT,
    );
  }, [onScreenTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, onScreenTheme, setTheme, toggleTheme }),
    [theme, onScreenTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
