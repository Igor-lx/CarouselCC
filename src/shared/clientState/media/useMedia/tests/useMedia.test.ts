import { describe, expect, it } from "vitest";

import { canonicalMediaQueries } from "../internal/canonicalMedia";

/**
 * The facade's own guard. The reactive hook is exercised through the
 * carousel's integration; here we pin the PURE derivation the facade and
 * every downstream consumer (data `<source media>`, diagnostics) share —
 * the canonical media set for a given set of axes.
 */
describe("canonicalMediaQueries", () => {
  it("emits width tiers (px>0), both orientations, and every flag", () => {
    const media = canonicalMediaQueries({
      breakpoints: { desktop: 1024, tablet: 768, mobile: 0 },
      flags: {
        "short-landscape": "(orientation: landscape) and (max-height: 520px)",
      },
    });
    expect(media).toEqual([
      "(min-width: 1024px)",
      "(min-width: 768px)",
      "(orientation: portrait)",
      "(orientation: landscape)",
      "(orientation: landscape) and (max-height: 520px)",
    ]);
  });

  it("excludes the 0 fallback tier (it would always match as a <source media>)", () => {
    const media = canonicalMediaQueries({ breakpoints: { only: 0 } });
    expect(media).not.toContain("(min-width: 0px)");
  });

  it("works with no flags", () => {
    const media = canonicalMediaQueries({ breakpoints: { d: 800, m: 0 } });
    expect(media).toEqual([
      "(min-width: 800px)",
      "(orientation: portrait)",
      "(orientation: landscape)",
    ]);
  });
});
