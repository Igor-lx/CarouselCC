import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "../internal/constants";
import { BROWSER_THEME_COLORS } from "../internal/colors";

const html = readFileSync("index.html", "utf8");

const attr = (pattern: RegExp): string | undefined => pattern.exec(html)?.[1];

describe("index.html theme boot stays in sync with the theme box", () => {
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
    expect(attr(/dark:\s*"(#[0-9a-fA-F]{3,8})"/)).toBe(BROWSER_THEME_COLORS.dark);
  });

  it("the boot script's STORAGE_KEY matches the canonical key", () => {
    expect(attr(/const STORAGE_KEY = "([^"]+)"/)).toBe(THEME_STORAGE_KEY);
  });

  it("the boot script validates the stored mode instead of trusting it", () => {
    expect(html).toMatch(/mode === "light" \|\| mode === "dark"/);
  });
});
