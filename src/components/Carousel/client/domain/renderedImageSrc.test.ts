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
  it("looks across ALL sets: a source can out-width the default", () => {
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        sources: [{ media: "(orientation: portrait)", srcSet: "/img/tall-1080.webp 1080w" }],
      }),
    ).toBe("/img/tall-1080.webp");
  });

  it("with aspects on EVERY set, compares by pixel AREA, not width", () => {
    // wide 720x405 (16:9) = 291600 px; tall 720x1280 (9:16) = 921600 px.
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        aspect: 16 / 9,
        sources: [
          {
            media: "(orientation: portrait)",
            srcSet: "/img/tall-720.webp 720w",
            aspect: 9 / 16,
          },
        ],
      }),
    ).toBe("/img/tall-720.webp");
  });

  it("area comparison is symmetric — a wider-aspect set wins when IT has more pixels", () => {
    // pano 1000x400 (2.5) = 400000 px; square 600x600 (1) = 360000 px.
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/square-600.webp 600w",
        aspect: 1,
        sources: [
          { media: "(min-width: 800px)", srcSet: "/img/pano-1000.webp 1000w", aspect: 2.5 },
        ],
      }),
    ).toBe("/img/pano-1000.webp");
  });

  it("any set missing its aspect drops the comparison to WIDTH only (no guessed heights)", () => {
    // aspects would favour tall, but the default set declares none.
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        sources: [
          {
            media: "(orientation: portrait)",
            srcSet: "/img/tall-720.webp 720w",
            aspect: 9 / 16,
          },
        ],
      }),
    ).toBe("/img/wide-720.webp"); // width tie -> the DEFAULT set keeps it
  });

  it("exact ties keep the default set's candidate", () => {
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        aspect: 1,
        sources: [
          { media: "(min-width: 800px)", srcSet: "/img/alt-720.webp 720w", aspect: 1 },
        ],
      }),
    ).toBe("/img/wide-720.webp");
  });

  it("default set only: plain largest", () => {
    expect(resolveLargestImageCandidate({ srcSet: SRCSET })).toBe(
      "/img/a-1280.webp",
    );
  });

  it("no sets at all yields null", () => {
    expect(resolveLargestImageCandidate(undefined)).toBeNull();
    expect(resolveLargestImageCandidate({})).toBeNull();
  });
});

describe("resolveRenderedImageSrc", () => {
  const slide: Slide = {
    id: "s1",
    content: "/img/a-480.webp",
    image: {
      srcSet: SRCSET,
      aspect: 16 / 9,
      sources: [
        {
          media: "(orientation: portrait)",
          srcSet: "/img/tall-1280.webp 1280w",
          aspect: 9 / 16,
        },
      ],
    },
  };

  it("responsive mode renders the canonical content URL", () => {
    expect(resolveRenderedImageSrc(slide, true)).toBe("/img/a-480.webp");
  });

  it("single-set mode renders the largest-by-AREA candidate across sets", () => {
    expect(resolveRenderedImageSrc(slide, false)).toBe("/img/tall-1280.webp");
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
