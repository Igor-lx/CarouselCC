import { describe, expect, it } from "vitest";

import {
  buildDotKeyframes,
  dotActiveStrength,
  dotStateAt,
  reachedDotIndexes,
  type DotVisualState,
} from "./fadeKeyframes";

const INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };

describe("dotActiveStrength", () => {
  it("is full under the offset and gone a whole step away", () => {
    expect(dotActiveStrength(0)).toBe(1);
    expect(dotActiveStrength(1)).toBe(0);
    expect(dotActiveStrength(-1)).toBe(0);
    expect(dotActiveStrength(2.5)).toBe(0);
  });

  it("is symmetric and linear between", () => {
    expect(dotActiveStrength(0.25)).toBeCloseTo(0.75, 10);
    expect(dotActiveStrength(-0.25)).toBeCloseTo(0.75, 10);
  });
});

describe("dotStateAt", () => {
  it("blends both channels by strength", () => {
    expect(dotStateAt(0, 0, INACTIVE, ACTIVE)).toEqual(ACTIVE);
    expect(dotStateAt(0, 1, INACTIVE, ACTIVE)).toEqual(INACTIVE);
    const half = dotStateAt(0, 0.5, INACTIVE, ACTIVE);
    expect(half.opacity).toBeCloseTo(0.5, 10);
    expect(half.scale).toBeCloseTo(1.2, 10);
  });
});

describe("buildDotKeyframes", () => {
  /**
   * The ordinary click must look exactly as it did under the old two-dot
   * cross-fade: a dot one step ahead blends by the plan's progress itself.
   * That equivalence is why the strength ramp is linear.
   */
  it("reproduces the plain cross-fade across a single step", () => {
    const stops = [0, 0.25, 0.6, 1];
    const incoming = buildDotKeyframes(1, 0, 1, stops, INACTIVE, ACTIVE);
    const outgoing = buildDotKeyframes(0, 0, 1, stops, INACTIVE, ACTIVE);

    stops.forEach((p, i) => {
      expect(incoming[i]!.opacity).toBeCloseTo(0.2 + 0.6 * p, 10);
      expect(outgoing[i]!.opacity).toBeCloseTo(0.8 - 0.6 * p, 10);
    });
    expect(incoming[3]!.transform).toBe("scaleX(1.4)");
    expect(outgoing[3]!.transform).toBe("scaleX(1)");
  });

  /**
   * The repeated click: the offset travels two steps, so the middle dot is
   * PASSED THROUGH — it must reach the full active look on the way and be back
   * at rest by the end, all on this one curve. No separate pulse exists.
   */
  it("carries a passed-through dot up to active and back down", () => {
    const stops = [0, 0.25, 0.5, 0.75, 1];
    const middle = buildDotKeyframes(1, 0, 2, stops, INACTIVE, ACTIVE);

    expect(middle[0]!.opacity).toBeCloseTo(0.2, 10);
    expect(middle[2]!.opacity).toBeCloseTo(0.8, 10); // offset is exactly 1 here
    expect(middle[4]!.opacity).toBeCloseTo(0.2, 10);
    expect(middle[2]!.transform).toBe("scaleX(1.4)");
  });

  it("keeps a far dot at rest for the whole step", () => {
    const frames = buildDotKeyframes(5, 0, 1, [0, 0.5, 1], INACTIVE, ACTIVE);
    frames.forEach((f) => expect(f.opacity).toBeCloseTo(0.2, 10));
  });

  it("works backwards as well as forwards", () => {
    const stops = [0, 0.5, 1];
    const incoming = buildDotKeyframes(0, 1, 0, stops, INACTIVE, ACTIVE);
    expect(incoming[0]!.opacity).toBeCloseTo(0.2, 10);
    expect(incoming[2]!.opacity).toBeCloseTo(0.8, 10);
  });
});

describe("reachedDotIndexes", () => {
  it("covers every dot the offset comes within a step of", () => {
    expect(reachedDotIndexes(0, 1, 9)).toEqual([0, 1, 2]);
    expect(reachedDotIndexes(0, 2, 9)).toEqual([0, 1, 2, 3]);
  });

  it("is direction-agnostic — the same span covers the same dots either way", () => {
    expect(reachedDotIndexes(2, 0, 9)).toEqual(reachedDotIndexes(0, 2, 9));
  });

  it("clamps to the deck at both ends", () => {
    expect(reachedDotIndexes(0, 0, 3)).toEqual([0, 1]);
    expect(reachedDotIndexes(7, 8, 9)).toEqual([6, 7, 8]);
  });
});
