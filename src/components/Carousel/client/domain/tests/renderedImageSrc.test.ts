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
   * Дескриптор разбирается регулярным выражением, и мутационный прогон показал,
   * что оно не закреплено ничем: любая его порча оставляла тесты зелёными.
   * Цена ошибки тихая — кандидат получает ширину 0 и проигрывает всем, то есть
   * в разметку уходит не тот файл, и увидеть это можно только глазами на
   * медленной сети.
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
