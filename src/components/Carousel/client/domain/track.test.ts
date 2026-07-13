import { describe, expect, it } from "vitest";

import {
  slideLaneStyle,
  slideSizerStyle,
  trackCssTransform,
  trackPixelTransform,
} from "./track";

describe("trackPixelTransform", () => {
  it("scrolls by -(position - origin) * slot", () => {
    expect(trackPixelTransform(3, 0, 100)).toBe("translate3d(-300px, 0, 0)");
    expect(trackPixelTransform(3, 2, 100)).toBe("translate3d(-100px, 0, 0)");
  });

  it("is origin-relative: same (position - origin) => same transform", () => {
    expect(trackPixelTransform(10, 4, 50)).toBe(trackPixelTransform(106, 100, 50));
  });
});

describe("slideLaneStyle", () => {
  it("positions a slide by its lane (virtualIndex - origin) in slot strides", () => {
    const s = slideLaneStyle(5, 3, 3);
    // lane 2 -> translateX(2 * one slot stride)
    expect(s.transform).toBe("translateX(calc(2 * (100% + var(--slides-gap, 0px))))");
    // width = 1/3 of the track minus the two shared gaps
    expect(s.width).toBe("calc((100% - var(--slides-gap, 0px) * 2) / 3)");
  });

  it("a slide's lane is invariant to the origin shift that keeps it in place", () => {
    // virtualIndex 5 @ origin 3 and virtualIndex 105 @ origin 103 are the same lane.
    expect(slideLaneStyle(5, 3, 2).transform).toBe(slideLaneStyle(105, 103, 2).transform);
  });

  it("negative lanes (clones behind the origin) translate left", () => {
    expect(slideLaneStyle(-1, 1, 1).transform).toBe(
      "translateX(calc(-2 * (100% + var(--slides-gap, 0px))))",
    );
  });
});

describe("slideSizerStyle", () => {
  it("is one slot wide (same width formula as a slide)", () => {
    expect(slideSizerStyle(3).width).toBe(slideLaneStyle(0, 0, 3).width);
  });
});

describe("trackCssTransform (pre-measure fallback)", () => {
  it("scrolls by -(position - origin) slot fractions of the track", () => {
    expect(trackCssTransform(3, 1, 3)).toBe(
      "translateX(calc(-2 * (100% + var(--slides-gap, 0px)) / 3)) translateX(0px)",
    );
  });
});
