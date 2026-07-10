import { describe, expect, it } from "vitest";

import {
  applyResistance,
  calculateEma,
  clampMagnitude,
  decayedVelocity,
  frameAdjustedAlpha,
  safeResistance,
  sameDirectionSpeed,
} from "../internals/math";

describe("safeResistance", () => {
  it("clamps into [0, 1]", () => {
    expect(safeResistance(-1)).toBe(0);
    expect(safeResistance(0.4)).toBe(0.4);
    expect(safeResistance(3)).toBe(1);
  });
});

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

describe("clampMagnitude", () => {
  it("clamps both directions, passes small values through", () => {
    expect(clampMagnitude(10, 5)).toBe(5);
    expect(clampMagnitude(-10, 5)).toBe(-5);
    expect(clampMagnitude(3, 5)).toBe(3);
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
