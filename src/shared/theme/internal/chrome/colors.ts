// index.html mirrors these (pre-paint boot, can't import); bootSync.test.ts guards the drift.
import { ON_SCREEN_MODES } from "../core/constants";

export const BROWSER_THEME_COLORS = {
  [ON_SCREEN_MODES.LIGHT]: "#bfd6f8",
  [ON_SCREEN_MODES.DARK]: "#0d1520",
} as const;
