import { describe, expect, it } from "vitest";

import { bezierToCss, parseBezier } from "./bezier";

describe("bezierToCss", () => {
  it("serializes the identity control points to the linear keyword", () => {
    expect(bezierToCss({ x1: 0, y1: 0, x2: 1, y2: 1 })).toBe("linear");
  });

  it("serializes non-identity control points to cubic-bezier()", () => {
    expect(bezierToCss({ x1: 0.32, y1: 0.2, x2: 0.28, y2: 1 })).toBe(
      "cubic-bezier(0.32, 0.2, 0.28, 1)",
    );
  });

  it("round-trips parsed CSS easing strings", () => {
    const css = "cubic-bezier(0.4, 0, 0.2, 1)";
    expect(bezierToCss(parseBezier(css))).toBe(css);
    expect(bezierToCss(parseBezier("linear"))).toBe("linear");
  });
});
