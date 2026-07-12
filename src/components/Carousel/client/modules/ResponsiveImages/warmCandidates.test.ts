import { describe, expect, it } from "vitest";

import {
  resolveParallelCandidate,
  resolveParallelSrcSet,
  resolveWarmPages,
} from "./warmCandidates";

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

describe("resolveParallelCandidate", () => {
  const SRCSET = "/a-480.webp 480w, /a-1280.webp 1280w, /a-800.webp 800w";

  it("picks the smallest candidate covering the target", () => {
    expect(resolveParallelCandidate(SRCSET, 700)).toBe("/a-800.webp");
  });

  it("falls back to the largest when nothing covers", () => {
    expect(resolveParallelCandidate(SRCSET, 4000)).toBe("/a-1280.webp");
  });

  it("returns null without a srcSet", () => {
    expect(resolveParallelCandidate(undefined, 700)).toBeNull();
    expect(resolveParallelCandidate("", 700)).toBeNull();
  });
});

describe("resolveParallelSrcSet", () => {
  const slide = {
    src: "/a.webp",
    srcSet: "/land-800.webp 800w",
    sources: [{ media: "(orientation: portrait)", srcSet: "/port-800.webp 800w" }],
  };

  it("portrait viewport parallels to the default (landscape) set", () => {
    expect(resolveParallelSrcSet(slide, true, "(orientation: portrait)")).toBe(
      "/land-800.webp 800w",
    );
  });

  it("landscape viewport parallels to the portrait source", () => {
    expect(resolveParallelSrcSet(slide, false, "(orientation: portrait)")).toBe(
      "/port-800.webp 800w",
    );
  });
});
