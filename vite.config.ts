import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

import { DEPLOY_BASE } from "./src/app/deployBase";
import { themeBootHtml } from "./src/shared/themeBoot";
import { BROWSER_THEME_COLORS, THEME_STORAGE_KEY } from "./src/theme/types";

/**
 * Inlines the theme boot (media-paired `theme-color` metas + the serialised
 * `applyThemeBoot` call) into index.html in place of `<!-- THEME_BOOT -->`.
 *
 * The boot must run synchronously at head-parse time — before the stylesheet
 * and before first paint — or the mobile bar tint regresses to white on cold
 * loads; a runtime module import is always deferred past that point. This
 * plugin is what lets the logic live as a typed, testable shared module
 * (src/shared/themeBoot.ts) with the colors defined once in src/theme/types.ts,
 * while the page still receives a self-contained inline script. Applies in
 * dev and build alike.
 */
const themeBootPlugin = (): Plugin => ({
  name: "theme-boot-inline",
  transformIndexHtml(html) {
    return html.replace(
      "<!-- THEME_BOOT -->",
      themeBootHtml(
        {
          light: BROWSER_THEME_COLORS.light,
          dark: BROWSER_THEME_COLORS.dark,
        },
        THEME_STORAGE_KEY,
      ),
    );
  },
});

export default defineConfig({
  plugins: [react(), themeBootPlugin()],
  base: DEPLOY_BASE,
  server: {
    open: true,
  },
});
