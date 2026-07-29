// Headless app-shell adapter: keeps the mobile browser chrome matching the theme.
// See ../../README.md
import { useEffect } from "react";

import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import { ON_SCREEN_MODES, THEME_MODES } from "./constants";
import { useTheme } from "../useTheme";
import { BROWSER_THEME_COLORS } from "../colors";

export function BrowserChromeSync(): null {
  const { theme, onScreenTheme } = useTheme();

  // Do NOT drop: mobile chrome samples the inline <html> bg (outranks the stylesheet).
  useIsomorphicLayoutEffect(() => {
    document.documentElement.style.backgroundColor =
      BROWSER_THEME_COLORS[onScreenTheme];
  }, [onScreenTheme]);

  // A host with no theme-color meta gets one — created ONCE and removed on
  // unmount, so lifting the box out leaves the document as it found it. Declared
  // before the sync below, which then fills it on the same commit.
  useEffect(() => {
    if (document.querySelector('meta[name="theme-color"]')) return;
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    metas.forEach((meta) => {
      // Only a scheme-PAIRED meta keeps its own colour in auto mode; that is
      // what `media` means. An unpaired one is unconditional, so it has to
      // carry the RESOLVED look — including the one created above.
      const media = meta.getAttribute("media");
      if (theme === THEME_MODES.AUTO && media) {
        const scheme = media.includes("dark")
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
