import { describe, expect, it } from "vitest";

import { buildSlide } from "../buildSlide";

describe("buildSlide", () => {
  it("assembles a width-descriptor srcSet and picks the smallest candidate as content", () => {
    const slide = buildSlide({
      id: "7",
      candidates: [
        { url: "big.webp", width: 720 },
        { url: "small.webp", width: 480 },
      ],
    });
    expect(slide.id).toBe("7");
    expect(slide.content).toBe("small.webp"); // smallest = canonical fallback
    expect(slide.image?.srcSet).toBe("small.webp 480w, big.webp 720w");
  });

  it("omits sizes by default so the carousel supplies it", () => {
    const slide = buildSlide({ id: "1", candidates: [{ url: "a.webp", width: 480 }] });
    expect(slide.image?.sizes).toBeUndefined();
  });

  it("emits an override sizes when provided", () => {
    const slide = buildSlide({
      id: "1",
      candidates: [{ url: "a.webp", width: 480 }],
      sizes: "50vw",
    });
    expect(slide.image?.sizes).toBe("50vw");
  });

  it("respects an explicit fallback over the smallest candidate", () => {
    const slide = buildSlide({
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
    const slide = buildSlide({
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
    const slide = buildSlide({ id: "1", candidates: [{ url: "a.webp", width: 480 }] });
    expect(slide.image && "sources" in slide.image).toBe(false);
  });
});
