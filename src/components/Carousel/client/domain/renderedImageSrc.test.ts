import { describe, expect, it } from "vitest";

import {
  deckCarriesImageSets,
  resolveLargestImageCandidate,
  resolveLargestSrcSetCandidate,
  resolveRenderedImageSrc,
} from "./slides";
import { buildSlideRecords } from "./slides";
import type { Slide } from "../public-api/types";

const SRCSET =
  "/img/a-480.webp 480w, /img/a-1280.webp 1280w, /img/a-800.webp 800w";
const PORTRAIT = "(orientation: portrait)";

describe("resolveLargestSrcSetCandidate", () => {
  it("picks the largest w-descriptor candidate regardless of order", () => {
    expect(resolveLargestSrcSetCandidate(SRCSET)).toEqual({
      url: "/img/a-1280.webp",
      width: 1280,
    });
  });

  it("treats descriptor-less entries as width 0", () => {
    expect(
      resolveLargestSrcSetCandidate("/img/plain.webp, /img/b-640.webp 640w"),
    ).toEqual({ url: "/img/b-640.webp", width: 640 });
  });

  it("returns null for missing or empty srcSet", () => {
    expect(resolveLargestSrcSetCandidate(undefined)).toBeNull();
    expect(resolveLargestSrcSetCandidate("")).toBeNull();
  });
});

describe("resolveLargestImageCandidate", () => {
  it("looks across ALL sets: an art-directed source can out-width the default", () => {
    expect(
      resolveLargestImageCandidate(
        {
          srcSet: "/img/wide-720.webp 720w",
          sources: [{ media: PORTRAIT, srcSet: "/img/tall-1080.webp 1080w" }],
        },
        PORTRAIT,
      ),
    ).toBe("/img/tall-1080.webp");
  });

  it("breaks a width TIE toward the portrait source (more pixels at equal width)", () => {
    expect(
      resolveLargestImageCandidate(
        {
          srcSet: "/img/wide-720.webp 720w",
          sources: [{ media: PORTRAIT, srcSet: "/img/tall-720.webp 720w" }],
        },
        PORTRAIT,
      ),
    ).toBe("/img/tall-720.webp");
  });

  it("a tie against a NON-portrait source keeps the default candidate", () => {
    expect(
      resolveLargestImageCandidate(
        {
          srcSet: "/img/wide-720.webp 720w",
          sources: [{ media: "(min-width: 800px)", srcSet: "/img/alt-720.webp 720w" }],
        },
        PORTRAIT,
      ),
    ).toBe("/img/wide-720.webp");
  });

  it("default set only: plain largest", () => {
    expect(resolveLargestImageCandidate({ srcSet: SRCSET }, PORTRAIT)).toBe(
      "/img/a-1280.webp",
    );
  });

  it("no sets at all yields null", () => {
    expect(resolveLargestImageCandidate(undefined, PORTRAIT)).toBeNull();
    expect(resolveLargestImageCandidate({}, PORTRAIT)).toBeNull();
  });
});

describe("resolveRenderedImageSrc", () => {
  const slide: Slide = {
    id: "s1",
    content: "/img/a-480.webp",
    image: {
      srcSet: SRCSET,
      sources: [{ media: PORTRAIT, srcSet: "/img/tall-1280.webp 1280w" }],
    },
  };

  it("responsive mode renders the canonical content URL", () => {
    expect(resolveRenderedImageSrc(slide, true, PORTRAIT)).toBe("/img/a-480.webp");
  });

  it("single-set mode renders the LARGEST candidate across sets (tie -> portrait)", () => {
    expect(resolveRenderedImageSrc(slide, false, PORTRAIT)).toBe(
      "/img/tall-1280.webp",
    );
  });

  it("falls back to content when there is no srcSet", () => {
    const plain: Slide = { id: "s2", content: "/img/only.webp" };
    expect(resolveRenderedImageSrc(plain, false, PORTRAIT)).toBe("/img/only.webp");
  });

  it("non-string content is not an image", () => {
    const text: Slide = { id: "s3", content: 42 };
    expect(resolveRenderedImageSrc(text, false, PORTRAIT)).toBeNull();
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
