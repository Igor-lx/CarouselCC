import { ON_SCREEN_MODES, THEME_MODES } from "./constants";
import type { OnScreenThemeMode, ThemeMode } from "./types";

/** Untrusted input → an explicit known mode, else AUTO. */
export const asThemeMode = (raw: string | null): ThemeMode =>
  raw === THEME_MODES.LIGHT ||
  raw === THEME_MODES.DARK ||
  raw === THEME_MODES.AUTO
    ? raw
    : THEME_MODES.AUTO;

/** OS dark preference; guarded so it is safe on the server / without matchMedia. */
export const prefersDark = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveOnScreen = (
  theme: ThemeMode,
  isDark: boolean,
): OnScreenThemeMode =>
  theme === THEME_MODES.AUTO
    ? isDark
      ? ON_SCREEN_MODES.DARK
      : ON_SCREEN_MODES.LIGHT
    : theme;
