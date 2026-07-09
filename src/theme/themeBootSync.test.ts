import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BROWSER_THEME_COLORS, THEME_STORAGE_KEY } from "./types";

/**
 * SSOT guard for the theme boot — same pattern as the carousel's boundary
 * tests: an invariant the code cannot express is enforced by CI instead.
 *
 * The inline script in index.html must run synchronously during head parsing
 * (before first paint, when mobile browsers commit the bar tint), so it
 * cannot import `BROWSER_THEME_COLORS` / `THEME_STORAGE_KEY` — the values are
 * deliberately duplicated there, in the two media-paired `theme-color` metas
 * and in the script's own constants. This test reads the file and fails on
 * any drift, so the duplication can never silently desynchronize.
 */

const html = readFileSync("index.html", "utf8");

const attr = (pattern: RegExp): string | undefined => pattern.exec(html)?.[1];

describe("index.html theme boot stays in sync with src/theme/types.ts", () => {
  it("media-paired theme-color metas carry the canonical colors", () => {
    expect(
      attr(/media="\(prefers-color-scheme: light\)"\s+content="([^"]+)"/),
    ).toBe(BROWSER_THEME_COLORS.light);
    expect(
      attr(/media="\(prefers-color-scheme: dark\)"\s+content="([^"]+)"/),
    ).toBe(BROWSER_THEME_COLORS.dark);
  });

  it("the boot script's COLORS literal matches the canonical colors", () => {
    expect(attr(/light:\s*"(#[0-9a-fA-F]{3,8})"/)).toBe(
      BROWSER_THEME_COLORS.light,
    );
    expect(attr(/dark:\s*"(#[0-9a-fA-F]{3,8})"/)).toBe(
      BROWSER_THEME_COLORS.dark,
    );
  });

  it("the boot script's STORAGE_KEY matches the canonical key", () => {
    expect(attr(/const STORAGE_KEY = "([^"]+)"/)).toBe(THEME_STORAGE_KEY);
  });

  it("the boot script validates the stored mode instead of trusting it", () => {
    // The corrupted-storage failure mode (data-theme="garbage",
    // content="undefined") must never come back: the script has to gate on
    // an explicit light/dark before using the stored value.
    expect(html).toMatch(/mode === "light" \|\| mode === "dark"/);
  });
});
