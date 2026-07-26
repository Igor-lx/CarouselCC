// index.html duplicates these values (pre-paint boot, can't import); themeBootSync.test.ts guards the drift.
export const THEME_STORAGE_KEY = "theme-mode";

export const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;

export const ON_SCREEN_MODES = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export const BROWSER_THEME_COLORS = {
  [ON_SCREEN_MODES.LIGHT]: "#bfd6f8",
  [ON_SCREEN_MODES.DARK]: "#0d1520",
} as const;
