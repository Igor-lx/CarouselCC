// Headless app-shell adapter: keeps the mobile browser chrome matching the theme.
// See ../../README.md
import { useEffect } from "react";

import { useIsomorphicLayoutEffect } from "../../../hooks/useIsomorphicLayoutEffect";
import { ON_SCREEN_MODES, THEME_MODES } from "../core/constants";
import { useTheme } from "../core/useTheme";
import { BROWSER_THEME_COLORS } from "./colors";

export function BrowserChromeSync(): null {
  const { theme, onScreenTheme } = useTheme();

  // Do NOT drop: mobile chrome samples the inline <html> bg (outranks the stylesheet).
  useIsomorphicLayoutEffect(() => {
    document.documentElement.style.backgroundColor =
      BROWSER_THEME_COLORS[onScreenTheme];
  }, [onScreenTheme]);

  useEffect(() => {
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (metas.length === 0) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", BROWSER_THEME_COLORS[onScreenTheme]);
      document.head.appendChild(meta);
      return;
    }
    metas.forEach((meta) => {
      if (theme === THEME_MODES.AUTO) {
        const scheme = meta.getAttribute("media")?.includes("dark")
          ? ON_SCREEN_MODES.DARK
          : ON_SCREEN_MODES.LIGHT;
        meta.setAttribute("content", BROWSER_THEME_COLORS[scheme]);
      } else {
        meta.setAttribute("content", BROWSER_THEME_COLORS[onScreenTheme]);
      }
    });
  }, [theme, onScreenTheme]);

  return null;
}
