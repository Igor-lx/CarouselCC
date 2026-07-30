import { describe, expect, it } from "vitest";

import {
  breakpointMinWidthQuery,
  resolveActiveBreakpoint,
} from "../resolveActiveBreakpoint";

/**
 * Fork of `media/library/tests/useBreakpoint.test.ts`, repointed at THIS copy
 * of the resolver — the one `useMedia` actually calls.
 *
 * Worth stating why the fork is not redundant: until it existed, the resolver
 * looked covered and was not. The tested copy lived in `library/`, which the
 * facade never imports, so a change here — a comparison flipped, a sort
 * reversed — would have left a green suite while the deck resolved to the
 * wrong tier. The two copies are duplicated by design and may drift; each
 * therefore carries its own guard.
 */

/** A viewport of the given width, as a min-width matcher. */
const viewport = (width: number) => (query: string) => {
  const px = Number(/\(min-width: (\d+)px\)/.exec(query)?.[1]);
  return Number.isFinite(px) && width >= px;
};

describe("resolveActiveBreakpoint (the copy useMedia calls)", () => {
  it("the largest matching threshold wins", () => {
    const table = { desktop: 1024, tablet: 768, mobile: 0 };
    expect(resolveActiveBreakpoint(table, viewport(1920))).toBe("desktop");
    expect(resolveActiveBreakpoint(table, viewport(800))).toBe("tablet");
    expect(resolveActiveBreakpoint(table, viewport(390))).toBe("mobile");
  });

  it("declaration ORDER and NAMING are irrelevant — resolution is numeric", () => {
    // Deliberately shuffled and custom-named: a narrower tier declared first
    // can never shadow a wider one.
    const shuffled = { melko: 0, shiroko: 2200, sredne: 1024 };
    expect(resolveActiveBreakpoint(shuffled, viewport(2560))).toBe("shiroko");
    expect(resolveActiveBreakpoint(shuffled, viewport(1200))).toBe("sredne");
    expect(resolveActiveBreakpoint(shuffled, viewport(400))).toBe("melko");
  });

  it("falls back to the narrowest tier when nothing matches", () => {
    const noFallback = { desktop: 1024, tablet: 768 };
    expect(resolveActiveBreakpoint(noFallback, () => false)).toBe("tablet");
  });

  it("an empty table resolves to an empty name (diagnostics flags it)", () => {
    expect(resolveActiveBreakpoint({}, () => true)).toBe("");
  });

  it("canonical query form is stable — the data contract string", () => {
    expect(breakpointMinWidthQuery(1024)).toBe("(min-width: 1024px)");
  });
});
