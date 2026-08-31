import { describe, expect, it } from "vitest";

import {
  deckCarriesImageSets,
  resolveLargestImageCandidate,
  resolveLargestSrcSetCandidate,
  resolveRenderedImageSrc,
} from "../slides";
import { buildSlideRecords } from "../slides";
import type { Slide } from "../../public-api/types";

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

  /**
   * The descriptor is parsed by a regular expression, and the mutation run
   * showed that nothing pinned it: every corruption of it left the tests
   * green. The cost is a quiet one — a candidate gets width 0, loses to
   * everything, and the wrong file ends up in the markup, visible only by eye
   * on a slow network.
   */
  it("takes a w-width descriptor, not an x-density and not a bare number", () => {
    const pick = (set: string) => resolveLargestSrcSetCandidate(set)?.url;
    // Density and a bare number are not width descriptors: both weigh zero, so
    // the FIRST entry wins rather than the larger-looking one.
    expect(pick("/a.webp 2x, /b.webp 3x")).toBe("/a.webp");
    expect(pick("/a.webp 480, /b.webp 800")).toBe("/a.webp");
    // A real width descriptor outranks both.
    expect(pick("/a.webp 2x, /b.webp 800w")).toBe("/b.webp");
  });

  it("accepts a fractional width and keeps its value", () => {
    expect(resolveLargestSrcSetCandidate("/a.webp 1.5w")).toEqual({
      url: "/a.webp",
      width: 1.5,
    });
  });

  it("a descriptor with trailing junk is not a width", () => {
    expect(resolveLargestSrcSetCandidate("/a.webp 800wide")?.width).toBe(0);
  });

  it("returns null for missing or empty srcSet", () => {
    expect(resolveLargestSrcSetCandidate(undefined)).toBeNull();
    expect(resolveLargestSrcSetCandidate("")).toBeNull();
  });
});

describe("resolveLargestImageCandidate", () => {
  it("scans ALL sets: a source can out-width the default", () => {
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        sources: [
          {
            media: "(orientation: portrait)",
            srcSet: "/img/tall-1080.webp 1080w",
          },
        ],
      }),
    ).toBe("/img/tall-1080.webp");
  });

  it("width is the whole rule — no height/orientation guessing", () => {
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-1280.webp 1280w",
        sources: [
          {
            media: "(orientation: portrait)",
            srcSet: "/img/tall-720.webp 720w",
          },
        ],
      }),
    ).toBe("/img/wide-1280.webp");
  });

  it("exact width ties keep the default srcSet's candidate", () => {
    expect(
      resolveLargestImageCandidate({
        srcSet: "/img/wide-720.webp 720w",
        sources: [
          { media: "(min-width: 800px)", srcSet: "/img/alt-720.webp 720w" },
        ],
      }),
    ).toBe("/img/wide-720.webp");
  });

  it("no sets at all yields null", () => {
    expect(resolveLargestImageCandidate(undefined)).toBeNull();
    expect(resolveLargestImageCandidate({})).toBeNull();
  });
});

describe("resolveRenderedImageSrc", () => {
  const image = {
    srcSet: SRCSET,
    defaultSrc: "/img/designated.webp",
    sources: [
      { media: "(orientation: portrait)", srcSet: "/img/tall-1280.webp 1280w" },
    ],
  };
  const slide: Slide = { id: "s1", content: "/img/a-480.webp", image };

  it("responsive mode renders the canonical content URL", () => {
    expect(resolveRenderedImageSrc(slide, true)).toBe("/img/a-480.webp");
  });

  it("single-set mode renders the publisher's DESIGNATED defaultSrc when present", () => {
    expect(resolveRenderedImageSrc(slide, false)).toBe("/img/designated.webp");
  });

  it("single-set mode falls back to the widest candidate when no defaultSrc", () => {
    const noDefault: Slide = {
      id: "s2",
      content: "/img/a-480.webp",
      image: {
        srcSet: SRCSET, // widest here is 1280w
        sources: [
          {
            media: "(orientation: portrait)",
            srcSet: "/img/tall-1600.webp 1600w",
          },
        ],
      },
    };
    expect(resolveRenderedImageSrc(noDefault, false)).toBe(
      "/img/tall-1600.webp",
    );
  });

  it("falls back to content when there is no image data at all", () => {
    const plain: Slide = { id: "s3", content: "/img/only.webp" };
    expect(resolveRenderedImageSrc(plain, false)).toBe("/img/only.webp");
  });

  it("non-string content is not an image", () => {
    const text: Slide = { id: "s4", content: 42 };
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

/**
 * `srcSet` is authored text: a stray comma, a double space, a density
 * descriptor. Every one of these used to leave the parser free to pick the
 * wrong file, and the only symptom is a blurry photo on a slow connection.
 */
describe("resolveLargestSrcSetCandidate — the shape of the text", () => {
  it("treats a run of whitespace as one separator", () => {
    expect(resolveLargestSrcSetCandidate("/a.webp   640w")).toEqual({
      url: "/a.webp",
      width: 640,
    });
  });

  it("skips an empty entry instead of adopting it as a candidate", () => {
    // A trailing or doubled comma is common in generated markup. Without the
    // skip the empty URL becomes the incumbent and every later zero-width
    // candidate loses to it, so the slide renders no image at all.
    expect(resolveLargestSrcSetCandidate(", /a.webp")).toEqual({
      url: "/a.webp",
      width: 0,
    });
  });

  it("requires the width to be the WHOLE descriptor", () => {
    // Anchored at both ends: "x640w" is not 640 wide, and neither is "640wx".
    expect(
      resolveLargestSrcSetCandidate("/a.webp x640w, /b.webp 100w"),
    ).toEqual({ url: "/b.webp", width: 100 });
  });

  it("keeps every decimal of a fractional width", () => {
    expect(resolveLargestSrcSetCandidate("/a.webp 1.25w")).toEqual({
      url: "/a.webp",
      width: 1.25,
    });
  });
});

describe("resolveLargestImageCandidate", () => {
  it("survives a source that yields no candidate at all", () => {
    // The art-directed sources are authored per breakpoint and one of them may
    // be empty. The winner must not be compared against nothing.
    expect(
      resolveLargestImageCandidate({
        defaultSrc: "/d.webp",
        srcSet: "/a.webp 100w",
        sources: [{ media: "(min-width: 0px)", srcSet: "" }],
      }),
    ).toBe("/a.webp");
  });

  it("takes the widest across the default set and the sources", () => {
    expect(
      resolveLargestImageCandidate({
        defaultSrc: "/d.webp",
        srcSet: "/a.webp 100w",
        sources: [{ media: "(min-width: 0px)", srcSet: "/b.webp 900w" }],
      }),
    ).toBe("/b.webp");
  });
});

describe("deckCarriesImageSets", () => {
  const deck = (images: (Slide["image"] | undefined)[]) =>
    buildSlideRecords(
      images.map((image, i) => ({
        id: `s-${i}`,
        content: "c",
        ...(image ? { image } : {}),
      })),
    );

  it("is true when ANY slide carries a set, not only when all do", () => {
    expect(
      deckCarriesImageSets(deck([undefined, { srcSet: "/a.webp 100w" }])),
    ).toBe(true);
  });

  it("counts art-directed sources, not just the default set", () => {
    expect(
      deckCarriesImageSets(
        deck([{ sources: [{ media: "(min-width: 0px)", srcSet: "/a 1w" }] }]),
      ),
    ).toBe(true);
  });

  it("is false for a deck whose images carry neither", () => {
    expect(deckCarriesImageSets(deck([{ defaultSrc: "/a.webp" }]))).toBe(false);
    expect(deckCarriesImageSets(deck([undefined]))).toBe(false);
  });
});
