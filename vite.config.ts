import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

import { DEPLOY_BASE } from "./src/app/deployBase";
import { BROWSER_THEME_COLORS, THEME_STORAGE_KEY } from "./src/theme/types";

/**
 * Injects the theme-boot constants into index.html at build/dev, so the inline
 * head script (which cannot import a module — it must run before first paint)
 * carries the SAME values as src/theme/types.ts without a hand-kept copy. The
 * `{{…}}` tokens in index.html are the injection points; there is no runtime
 * fetch and no generated file — just a build-time string substitution from the
 * single source. (src/theme/types.ts is deliberately react-free so it imports
 * cleanly into this Node config.)
 */
function themeBootInject(): Plugin {
  const replacements: Record<string, string> = {
    "{{THEME_COLOR_LIGHT}}": BROWSER_THEME_COLORS.light,
    "{{THEME_COLOR_DARK}}": BROWSER_THEME_COLORS.dark,
    "{{THEME_COLORS_JSON}}": JSON.stringify(BROWSER_THEME_COLORS),
    "{{THEME_STORAGE_KEY}}": THEME_STORAGE_KEY,
  };
  return {
    name: "theme-boot-inject",
    transformIndexHtml(html) {
      return Object.entries(replacements).reduce(
        (out, [token, value]) => out.split(token).join(value),
        html,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), themeBootInject()],
  base: DEPLOY_BASE,
  server: {
    open: true,
  },
});
