import { describe, expect, it } from "vitest";

import { clamp, mod, normalizePageIndex, shortestCyclicDistance } from "./math";

describe("mod", () => {
  it("wraps positive and negative values into [0, total)", () => {
    expect(mod(7, 4)).toBe(3);
    expect(mod(-1, 4)).toBe(3);
    expect(mod(-5, 4)).toBe(3);
    expect(mod(4, 4)).toBe(0);
  });

  it("returns 0 for a non-positive total", () => {
    expect(mod(3, 0)).toBe(0);
    expect(mod(3, -2)).toBe(0);
  });
});

describe("clamp", () => {
  it("passes a value already inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps to the bounds", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("normalizePageIndex", () => {
  it("wraps a page index across the cyclic page count", () => {
    expect(normalizePageIndex(5, 4)).toBe(1);
    expect(normalizePageIndex(-1, 4)).toBe(3);
  });
  it("returns 0 when there are no pages", () => {
    expect(normalizePageIndex(3, 0)).toBe(0);
  });
});

describe("shortestCyclicDistance", () => {
  it("picks the forward direction when it is shorter", () => {
    expect(shortestCyclicDistance(0, 2, 10)).toBe(2);
  });
  it("picks the backward direction when it is shorter", () => {
    expect(shortestCyclicDistance(0, 8, 10)).toBe(-2);
  });
  it("prefers the forward direction on an exact tie", () => {
    expect(shortestCyclicDistance(0, 5, 10)).toBe(5);
  });
  it("returns 0 for a non-positive total", () => {
    expect(shortestCyclicDistance(0, 3, 0)).toBe(0);
  });
});
