import { describe, expect, it } from "vitest";

import {
  atLeast,
  greaterThan,
  inRangeExclusiveLower,
  inRangeExclusiveUpper,
  inRangeInclusive,
  isFiniteNumber,
  isNonNegativeFinite,
  isNonNegativeInteger,
  isPositiveFinite,
  isPositiveInteger,
} from "./numeric";

/** Every guard must reject these regardless of its own rule. */
const NEVER_NUMBERS: unknown[] = [Number.NaN, Infinity, -Infinity, "3", null, undefined, {}];

const guards = {
  isFiniteNumber,
  isPositiveFinite,
  isNonNegativeFinite,
  isPositiveInteger,
  isNonNegativeInteger,
  "greaterThan(0)": greaterThan(0),
  "atLeast(0)": atLeast(0),
  "inRangeInclusive(0,1)": inRangeInclusive(0, 1),
  "inRangeExclusiveLower(0,1)": inRangeExclusiveLower(0, 1),
  "inRangeExclusiveUpper(0,1)": inRangeExclusiveUpper(0, 1),
};

describe("finiteness is implied by every guard", () => {
  for (const [name, guard] of Object.entries(guards)) {
    it(`${name} rejects NaN / Infinity / non-numbers`, () => {
      for (const value of NEVER_NUMBERS) {
        expect(guard(value)).toBe(false);
      }
    });
  }
});

describe("sign and integer guards", () => {
  it("isPositiveFinite / isNonNegativeFinite split on zero", () => {
    expect(isPositiveFinite(0)).toBe(false);
    expect(isNonNegativeFinite(0)).toBe(true);
    expect(isPositiveFinite(0.5)).toBe(true);
    expect(isNonNegativeFinite(-0.5)).toBe(false);
  });

  it("integer guards reject fractions and split on zero", () => {
    expect(isPositiveInteger(2)).toBe(true);
    expect(isPositiveInteger(2.5)).toBe(false);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isNonNegativeInteger(-1)).toBe(false);
  });
});

describe("comparison factories", () => {
  it("greaterThan is strict, atLeast is inclusive", () => {
    expect(greaterThan(5)(5)).toBe(false);
    expect(greaterThan(5)(5.01)).toBe(true);
    expect(atLeast(5)(5)).toBe(true);
    expect(atLeast(5)(4.99)).toBe(false);
  });

  it("range factories differ exactly at their open bounds", () => {
    expect(inRangeInclusive(0, 1)(0)).toBe(true);
    expect(inRangeInclusive(0, 1)(1)).toBe(true);
    expect(inRangeExclusiveLower(0, 1)(0)).toBe(false);
    expect(inRangeExclusiveLower(0, 1)(1)).toBe(true);
    expect(inRangeExclusiveUpper(0, 1)(0)).toBe(true);
    expect(inRangeExclusiveUpper(0, 1)(1)).toBe(false);
    expect(inRangeInclusive(0, 1)(0.5)).toBe(true);
    expect(inRangeInclusive(0, 1)(1.5)).toBe(false);
  });
});
