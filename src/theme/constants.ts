// See ./README.md
// Value-level SSOT for the theme. The pre-paint boot script in index.html
// mirrors these (it cannot import) — themeBootSync.test.ts guards the drift.

/** localStorage key for the persisted theme mode. */
export const THEME_STORAGE_KEY = "theme-mode";

/** The modes a user can pick. */
export const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;

/** The resolved on-screen looks (auto excluded). */
export const ON_SCREEN_MODES = {
  LIGHT: "light",
  DARK: "dark",
} as const;

/** Browser-chrome tint per on-screen look (the `theme-color` meta / <html> bg). */
export const BROWSER_THEME_COLORS = {
  [ON_SCREEN_MODES.LIGHT]: "#bfd6f8",
  [ON_SCREEN_MODES.DARK]: "#0d1520",
} as const;
