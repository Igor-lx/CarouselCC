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

export type ThemeMode = (typeof THEME_MODES)[keyof typeof THEME_MODES];
export type OnScreenThemeMode =
  (typeof ON_SCREEN_MODES)[keyof typeof ON_SCREEN_MODES];

export interface ThemeContextValue {
  theme: ThemeMode;
  onScreenTheme: OnScreenThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}
