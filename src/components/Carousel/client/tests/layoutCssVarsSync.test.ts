import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SSOT guard for the JS -> CSS layout contract. JS hands the stylesheet two
 * DATA custom properties and no rules: `--visible-slides` (the live
 * `visibleSlidesNr`, on the root) and `--slide-lane` (per slide). The
 * stylesheet owns the rules that turn them into a width and a translate.
 * Rename either side and the deck would silently collapse (a missing var
 * falls back and every slide would stack in lane 0), so read the real files
 * and assert both halves still speak the same names — same pattern as
 * `orientationMediaSync.test.ts`.
 *
 * The JS half lives in `presentation/cssVars.ts` — the one module that owns
 * "which custom properties this component publishes, in what units".
 */
const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

const scss = read("../Carousel.module.scss");
const cssVars = read("../presentation/cssVars.ts");

describe("layout CSS custom properties SSOT", () => {
  it("JS publishes --visible-slides on the root", () => {
    expect(cssVars).toContain('"--visible-slides"');
  });

  it("the SCSS width rule consumes --visible-slides (rule lives in the stylesheet)", () => {
    expect(scss).toContain("var(--visible-slides");
    expect(scss).toMatch(/\.slideSizer,\s*\.slide\s*\{[\s\S]*?width:\s*calc\(/);
  });

  it("JS publishes --slide-lane per slide", () => {
    expect(cssVars).toContain('"--slide-lane"');
  });

  it("the SCSS transform rule consumes --slide-lane (rule lives in the stylesheet)", () => {
    expect(scss).toContain("var(--slide-lane");
    expect(scss).toMatch(/transform:\s*translateX\(\s*calc\(var\(--slide-lane/);
  });

  // Two greps used to live here and both were dropped for the same reason:
  // they asserted where code SITS rather than what it DOES.
  //
  //  - `not.toContain("calc(")` over the view and vars module: an arbitrary
  //    spot-check, since `domain/track.ts` builds exactly such a string in JS
  //    by design (the pre-measurement fallback transform);
  //  - `Carousel.tsx` does not contain the variable names: green with the
  //    contract fully broken, red on a harmless move of the declaration.
  //
  // The four cases above name the actual variables on both sides, which is
  // the part that can catch a real rename.
});
