// index.html mirrors THEME_STORAGE_KEY (pre-paint boot, can't import); bootSync.test.ts guards the drift.
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
