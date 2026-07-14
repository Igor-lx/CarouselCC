import { describe, expect, it } from "vitest";

import { resolveRenderedSrcSet, resolveWarmPages } from "./warmCandidates";

const PORTRAIT = "(orientation: portrait)";

describe("resolveRenderedSrcSet", () => {
  const slide = {
    src: "/wide-480.webp",
    srcSet: "/wide-480.webp 480w, /wide-720.webp 720w",
    sizes: "100vw",
    sources: [
      { media: PORTRAIT, srcSet: "/tall-480.webp 480w, /tall-720.webp 720w", sizes: "90vw" },
    ],
  };

  it("portrait picks the art-directed source — the crop the deck actually renders", () => {
    expect(resolveRenderedSrcSet(slide, true, PORTRAIT)).toEqual({
      srcSet: "/tall-480.webp 480w, /tall-720.webp 720w",
      sizes: "90vw",
    });
  });

  it("landscape falls back to the default set", () => {
    expect(resolveRenderedSrcSet(slide, false, PORTRAIT)).toEqual({
      srcSet: "/wide-480.webp 480w, /wide-720.webp 720w",
      sizes: "100vw",
    });
  });

  it("a deck with no art-directed source always uses the default set", () => {
    const plain = { src: "/a.webp", srcSet: "/a-480.webp 480w" };
    expect(resolveRenderedSrcSet(plain, true, PORTRAIT).srcSet).toBe("/a-480.webp 480w");
  });

  it("a slide with no sets at all resolves to nothing to select from", () => {
    expect(resolveRenderedSrcSet({ src: "/a.webp" }, true, PORTRAIT)).toEqual({
      srcSet: undefined,
      sizes: undefined,
    });
  });
});

describe("resolveWarmPages", () => {
  it("warms both neighbours, wrapping on a cyclic deck", () => {
    expect(resolveWarmPages(0, 4, 1, false).sort()).toEqual([1, 3]);
  });

  it("clamps at the edges of a finite deck", () => {
    expect(resolveWarmPages(0, 4, 1, true)).toEqual([1]);
    expect(resolveWarmPages(3, 4, 1, true)).toEqual([2]);
  });

  it("expands with pagesNr and never includes the target itself", () => {
    const pages = resolveWarmPages(1, 6, 2, false).sort();
    expect(pages).toEqual([0, 2, 3, 5]);
    expect(pages).not.toContain(1);
  });

  it("degenerate decks warm nothing", () => {
    expect(resolveWarmPages(0, 1, 1, false)).toEqual([]);
    expect(resolveWarmPages(0, 4, 0, false)).toEqual([]);
  });
});
