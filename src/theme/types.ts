import type { THEME_MODES, ON_SCREEN_MODES } from "./constants";

export type ThemeMode = (typeof THEME_MODES)[keyof typeof THEME_MODES];
export type OnScreenThemeMode =
  (typeof ON_SCREEN_MODES)[keyof typeof ON_SCREEN_MODES];

export interface ThemeContextValue {
  theme: ThemeMode;
  onScreenTheme: OnScreenThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}
