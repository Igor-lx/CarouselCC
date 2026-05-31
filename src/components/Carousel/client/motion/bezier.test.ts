import { describe, expect, it } from "vitest";

import { bezierToCss, parseBezier } from "./bezier";

describe("bezierToCss", () => {
  it("maps the identity control points to the `linear` keyword", () => {
    expect(bezierToCss({ x1: 0, y1: 0, x2: 1, y2: 1 })).toBe("linear");
  });

  it("serialises a non-identity curve to a cubic-bezier() string", () => {
    expect(bezierToCss({ x1: 0.32, y1: 0.2, x2: 0.28, y2: 1 })).toBe(
      "cubic-bezier(0.32, 0.2, 0.28, 1)",
    );
  });

  it("round-trips a parsed cubic-bezier string back to an equivalent curve", () => {
    const css = "cubic-bezier(0.4, 0, 0.2, 1)";
    expect(bezierToCss(parseBezier(css))).toBe(css);
  });

  it("round-trips the parsed `linear` keyword", () => {
    expect(bezierToCss(parseBezier("linear"))).toBe("linear");
  });
});
