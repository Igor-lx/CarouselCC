import { THEME_STORAGE_KEY } from "./constants";
import { asThemeMode } from "./resolve";
import type { ThemeMode } from "./types";

// localStorage may be absent (SSR) or throw (privacy mode / disabled) — never crash.
export const readStoredMode = (): ThemeMode => {
  try {
    return asThemeMode(
      globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null,
    );
  } catch {
    return asThemeMode(null);
  }
};

export const writeStoredMode = (mode: ThemeMode): void => {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* persistence is best-effort */
  }
};
