import { describe, expect, it } from "vitest";

import {
  buildResponsiveSlide,
  buildResponsiveSlides,
} from "./buildResponsiveSlide";

describe("buildResponsiveSlide", () => {
  it("assembles a width-descriptor srcSet and picks the smallest candidate as content", () => {
    const slide = buildResponsiveSlide({
      id: "7",
      candidates: [
        { url: "big.webp", width: 720 },
        { url: "small.webp", width: 480 },
      ],
    });
    expect(slide.id).toBe("7");
    // content = canonical fallback = smallest, regardless of input order.
    expect(slide.content).toBe("small.webp");
    expect(slide.image?.srcSet).toBe("small.webp 480w, big.webp 720w");
  });

  it("omits sizes by default so the carousel supplies it", () => {
    const slide = buildResponsiveSlide({
      id: "1",
      candidates: [{ url: "a.webp", width: 480 }],
    });
    expect(slide.image?.sizes).toBeUndefined();
  });

  it("emits an override sizes when provided", () => {
    const slide = buildResponsiveSlide({
      id: "1",
      candidates: [{ url: "a.webp", width: 480 }],
      sizes: "50vw",
    });
    expect(slide.image?.sizes).toBe("50vw");
  });

  it("respects an explicit fallback over the smallest candidate", () => {
    const slide = buildResponsiveSlide({
      id: "1",
      candidates: [
        { url: "small.webp", width: 480 },
        { url: "big.webp", width: 720 },
      ],
      fallback: "canonical.webp",
    });
    expect(slide.content).toBe("canonical.webp");
  });

  it("builds art-directed sources with their own width-descriptor srcSet", () => {
    const slide = buildResponsiveSlide({
      id: "3",
      alt: "third",
      candidates: [
        { url: "p480.webp", width: 480 },
        { url: "p720.webp", width: 720 },
      ],
      sources: [
        {
          media: "(orientation: landscape) and (max-height: 520px)",
          candidates: [
            { url: "l720.webp", width: 720 },
            { url: "l480.webp", width: 480 },
          ],
          type: "image/webp",
        },
      ],
    });
    expect(slide.alt).toBe("third");
    expect(slide.image?.sources).toEqual([
      {
        media: "(orientation: landscape) and (max-height: 520px)",
        srcSet: "l480.webp 480w, l720.webp 720w",
        type: "image/webp",
      },
    ]);
  });

  it("produces no sources key when none are supplied", () => {
    const slide = buildResponsiveSlide({
      id: "1",
      candidates: [{ url: "a.webp", width: 480 }],
    });
    expect(slide.image && "sources" in slide.image).toBe(false);
  });
});

describe("buildResponsiveSlides (batch)", () => {
  it("zips parallel resolution sets by index with default 1-based ids", () => {
    const slides = buildResponsiveSlides({
      sets: [
        { width: 480, urls: ["s1-480", "s2-480"] },
        { width: 720, urls: ["s1-720", "s2-720"] },
      ],
    });
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      id: "1",
      content: "s1-480",
      image: { srcSet: "s1-480 480w, s1-720 720w" },
    });
    expect(slides[1]).toMatchObject({ id: "2", content: "s2-480" });
  });

  it("attaches index-aligned art-directed sources", () => {
    const [slide] = buildResponsiveSlides({
      sets: [{ width: 480, urls: ["p1"] }],
      sources: [
        {
          media: "(orientation: landscape)",
          type: "image/webp",
          sets: [
            { width: 480, urls: ["l1-480"] },
            { width: 720, urls: ["l1-720"] },
          ],
        },
      ],
    });
    expect(slide.image?.sources).toEqual([
      {
        media: "(orientation: landscape)",
        srcSet: "l1-480 480w, l1-720 720w",
        type: "image/webp",
      },
    ]);
  });

  it("is orientation-neutral — the default set can be landscape", () => {
    const [slide] = buildResponsiveSlides({
      sets: [{ width: 720, urls: ["land-720"] }],
      sources: [
        {
          media: "(orientation: portrait)",
          sets: [{ width: 480, urls: ["port-480"] }],
        },
      ],
    });
    expect(slide.content).toBe("land-720");
    expect(slide.image?.sources?.[0]?.media).toBe("(orientation: portrait)");
  });

  it("drops a missing variant for a slide without requiring every set aligned", () => {
    const slides = buildResponsiveSlides({
      sets: [
        { width: 480, urls: ["s1-480", "s2-480"] },
        { width: 720, urls: ["s1-720"] }, // only slide 1 has a 720 variant
      ],
    });
    expect(slides[0]?.image?.srcSet).toBe("s1-480 480w, s1-720 720w");
    expect(slides[1]?.image?.srcSet).toBe("s2-480 480w"); // 720 dropped
  });

  it("supports a custom id mapper", () => {
    const slides = buildResponsiveSlides({
      sets: [{ width: 480, urls: ["a", "b"] }],
      id: (i) => `slide-${i}`,
    });
    expect(slides.map((s) => s.id)).toEqual(["slide-0", "slide-1"]);
  });
});
