import { describe, expect, it } from "vitest";

import {
  applyResistance,
  calculateEma,
  decayedVelocity,
  frameAdjustedAlpha,
  pauseDecayedVelocity,
} from "../swipe/internals/math";
import { sameDirectionSpeed } from "../inertia/speed";

// `safeResistance`, `clampMagnitude` and `dominantMagnitude` had a describe
// each. All three are one-line arithmetic that cannot fail subtly, and the two
// that carry meaning are already asserted where that meaning lives:
// safeResistance through applyResistance's "1:1 at zero, finite at one" case,
// dominantMagnitude through resolveSwipeDirection's "flicks on the
// WEIGHTED-AVERAGE speed" case.

describe("applyResistance", () => {
  it("tracks the finger ~1:1 near zero", () => {
    expect(applyResistance(1, 0.7, 0.002)).toBeCloseTo(1, 2);
  });

  it("lags progressively more as the pull grows", () => {
    const near = applyResistance(50, 0.7, 0.002) / 50;
    const far = applyResistance(500, 0.7, 0.002) / 500;
    expect(far).toBeLessThan(near);
    expect(applyResistance(500, 0.7, 0.002)).toBeLessThan(500);
  });

  it("preserves the sign", () => {
    expect(applyResistance(-200, 0.7, 0.002)).toBeLessThan(0);
    expect(Math.abs(applyResistance(-200, 0.7, 0.002))).toBeCloseTo(
      applyResistance(200, 0.7, 0.002),
      10,
    );
  });

  it("is 1:1 with zero resistance and finite as resistance approaches 1", () => {
    expect(applyResistance(300, 0, 0.002)).toBe(300);
    expect(Number.isFinite(applyResistance(300, 1, 0.002))).toBe(true);
  });
});

describe("calculateEma / frameAdjustedAlpha", () => {
  it("blends previous and instant by alpha", () => {
    expect(calculateEma(0, 10, 0.5)).toBe(5);
    expect(calculateEma(10, 10, 0.3)).toBe(10);
  });

  it("frame-adjusted alpha equals the base alpha at exactly one frame budget", () => {
    expect(frameAdjustedAlpha(0.7, 1000 / 60)).toBeCloseTo(0.7, 10);
  });

  it("a long gap weighs like repeated single-frame applications", () => {
    const twoFrames = frameAdjustedAlpha(0.5, (1000 / 60) * 2);
    expect(twoFrames).toBeCloseTo(1 - 0.5 * 0.5, 10);
  });
});

describe("decayedVelocity", () => {
  it("keeps the velocity for a zero gap and decays it toward zero over time", () => {
    expect(decayedVelocity(2, 0.7, 0)).toBe(2);
    const later = decayedVelocity(2, 0.7, 100);
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(2);
    expect(decayedVelocity(2, 0.7, 10000)).toBeCloseTo(0, 5);
  });
});

describe("sameDirectionSpeed", () => {
  it("returns the magnitude when the velocity helps the travel", () => {
    expect(sameDirectionSpeed(2, 10)).toBe(2);
    expect(sameDirectionSpeed(-2, -10)).toBe(2);
  });

  it("returns 0 for opposing, degenerate, or non-finite inputs", () => {
    expect(sameDirectionSpeed(2, -10)).toBe(0);
    expect(sameDirectionSpeed(2, 0)).toBe(0);
    expect(sameDirectionSpeed(Number.NaN, 10)).toBe(0);
    expect(sameDirectionSpeed(Infinity, 10)).toBe(0);
  });
});

describe("pauseDecayedVelocity", () => {
  it("costs nothing within the grace window", () => {
    expect(pauseDecayedVelocity(2, 0, 120, 250)).toBe(2);
    expect(pauseDecayedVelocity(2, 119, 120, 250)).toBe(2);
    expect(pauseDecayedVelocity(2, 120, 120, 250)).toBe(2);
  });

  it("halves per half-life beyond the grace", () => {
    expect(pauseDecayedVelocity(2, 120 + 250, 120, 250)).toBeCloseTo(1, 10);
    expect(pauseDecayedVelocity(2, 120 + 500, 120, 250)).toBeCloseTo(0.5, 10);
  });

  it("a realistic lift-off stick keeps most of the speed (vs frame-EMA zeroing)", () => {
    // 200ms stick: 80ms past grace -> ~80% kept. A per-frame decay at alpha
    // 0.85 would keep ~0.000002%.
    const kept = pauseDecayedVelocity(1, 200, 120, 250);
    expect(kept).toBeGreaterThan(0.75);
    expect(decayedVelocity(1, 0.85, 200)).toBeLessThan(0.0001);
  });

  it("degenerate half-life disables decay instead of exploding", () => {
    expect(pauseDecayedVelocity(2, 1000, 120, 0)).toBe(2);
  });
});
