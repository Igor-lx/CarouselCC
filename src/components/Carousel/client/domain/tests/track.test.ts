import { describe, expect, it } from "vitest";

import { slideLane, trackCssTransform, trackPixelTransform } from "../track";

describe("trackPixelTransform", () => {
  it("scrolls by -(position - origin) * slot", () => {
    expect(trackPixelTransform(3, 0, 100)).toBe("translate3d(-300px, 0, 0)");
    expect(trackPixelTransform(3, 2, 100)).toBe("translate3d(-100px, 0, 0)");
  });

  it("is origin-relative: same (position - origin) => same transform", () => {
    expect(trackPixelTransform(10, 4, 50)).toBe(trackPixelTransform(106, 100, 50));
  });
});

describe("slideLane", () => {
  it("is the slide's offset from the layout origin, in slot strides", () => {
    expect(slideLane(5, 3)).toBe(2);
    expect(slideLane(0, 0)).toBe(0);
  });

  it("clones behind the origin get negative lanes", () => {
    expect(slideLane(-1, 1)).toBe(-2);
  });

  it("is invariant to an origin shift that keeps the slide in place", () => {
    // virtualIndex 5 @ origin 3 and 105 @ origin 103 are the same lane, so the
    // rare origin recenter moves no slide on screen.
    expect(slideLane(5, 3)).toBe(slideLane(105, 103));
  });
});

describe("trackCssTransform (pre-measure fallback)", () => {
  it("scrolls by -(position - origin) slot fractions of the track", () => {
    expect(trackCssTransform(3, 1, 3)).toBe(
      "translateX(calc(-2 * (100% + var(--slides-gap, 0px)) / 3)) translateX(0px)",
    );
  });
});
