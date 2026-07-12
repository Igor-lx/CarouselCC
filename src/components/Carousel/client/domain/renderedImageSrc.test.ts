import { describe, expect, it } from "vitest";

import {
  deckCarriesImageSets,
  resolveLargestSrcSetCandidate,
  resolveRenderedImageSrc,
} from "./slides";
import { buildSlideRecords } from "./slides";
import type { Slide } from "../public-api/types";

const SRCSET =
  "/img/a-480.webp 480w, /img/a-1280.webp 1280w, /img/a-800.webp 800w";

describe("resolveLargestSrcSetCandidate", () => {
  it("picks the largest w-descriptor candidate regardless of order", () => {
    expect(resolveLargestSrcSetCandidate(SRCSET)).toBe("/img/a-1280.webp");
  });

  it("treats descriptor-less entries as width 0", () => {
    expect(
      resolveLargestSrcSetCandidate("/img/plain.webp, /img/b-640.webp 640w"),
    ).toBe("/img/b-640.webp");
  });

  it("returns null for missing or empty srcSet", () => {
    expect(resolveLargestSrcSetCandidate(undefined)).toBeNull();
    expect(resolveLargestSrcSetCandidate("")).toBeNull();
  });
});

describe("resolveRenderedImageSrc", () => {
  const slide: Slide = {
    id: "s1",
    content: "/img/a-480.webp",
    image: { srcSet: SRCSET },
  };

  it("responsive mode renders the canonical content URL", () => {
    expect(resolveRenderedImageSrc(slide, true)).toBe("/img/a-480.webp");
  });

  it("single-set mode renders the LARGEST candidate (quality first)", () => {
    expect(resolveRenderedImageSrc(slide, false)).toBe("/img/a-1280.webp");
  });

  it("falls back to content when there is no srcSet", () => {
    const plain: Slide = { id: "s2", content: "/img/only.webp" };
    expect(resolveRenderedImageSrc(plain, false)).toBe("/img/only.webp");
  });

  it("non-string content is not an image", () => {
    const text: Slide = { id: "s3", content: 42 };
    expect(resolveRenderedImageSrc(text, false)).toBeNull();
  });
});

describe("deckCarriesImageSets", () => {
  it("detects variants and their absence", () => {
    const withSets = buildSlideRecords([
      { id: "a", content: "/a.webp", image: { srcSet: SRCSET } },
    ]);
    const plain = buildSlideRecords([{ id: "b", content: "/b.webp" }]);
    expect(deckCarriesImageSets(withSets)).toBe(true);
    expect(deckCarriesImageSets(plain)).toBe(false);
  });
});
