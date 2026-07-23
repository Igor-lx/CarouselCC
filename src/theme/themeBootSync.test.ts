import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Theme-boot guard.
 *
 * The theme constants are NO LONGER duplicated in index.html: the inline head
 * script carries `{{…}}` tokens that the `theme-boot-inject` plugin
 * (vite.config.ts) fills from the single source (BROWSER_THEME_COLORS /
 * THEME_STORAGE_KEY, src/theme/types.ts) at build/dev. So there is no value to
 * keep in sync anymore. What still needs guarding is (1) the injection points
 * survive — remove a token and the boot script gets a broken value — and
 * (2) nobody re-hardcodes a colour, which would silently shadow the injection
 * and bring the drift back; plus (3) the corrupted-storage logic guard.
 */

const html = readFileSync("index.html", "utf8");

describe("index.html theme boot", () => {
  it("keeps every injection token the plugin fills", () => {
    for (const token of [
      "{{THEME_COLOR_LIGHT}}",
      "{{THEME_COLOR_DARK}}",
      "{{THEME_COLORS_JSON}}",
      "{{THEME_STORAGE_KEY}}",
    ]) {
      expect(html).toContain(token);
    }
  });

  it("hard-codes no theme colour (the single source is src/theme/types.ts)", () => {
    // A literal hex in the boot script or the metas would shadow the injection
    // and silently reintroduce the duplication this replaced.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("validates the stored mode instead of trusting it", () => {
    // The corrupted-storage failure mode (data-theme="garbage",
    // content="undefined") must never come back: the script has to gate on an
    // explicit light/dark before using the stored value.
    expect(html).toMatch(/mode === "light" \|\| mode === "dark"/);
  });
});
