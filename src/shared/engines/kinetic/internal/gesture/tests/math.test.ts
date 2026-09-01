/**
 * FORK of `shared/engines/gesture/tests/math.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { describe, expect, it } from "vitest";

import {
  applyResistance,
  clampMagnitude,
  dominantMagnitude,
  calculateEma,
  decayedVelocity,
  frameAdjustedAlpha,
  pauseDecayedVelocity,
} from "../swipe/internals/math";
import { sameDirectionSpeed } from "../inertia/speed";

// `safeResistance` has no block of its own: its clamp is asserted where it
// matters, in applyResistance's "1:1 at zero, finite at one" case.
//
// `clampMagnitude` and `dominantMagnitude` DO have one, below. They lost it
// once to the argument that one-line arithmetic cannot fail subtly; a mutation
// run disagreed and named the price — the whole body of clampMagnitude could
// be emptied out, and dominantMagnitude's tie could flip, with every suite
// still green.

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

describe("clampMagnitude", () => {
  // This one lost its block to the claim that it "cannot fail subtly". The
  // measurement disagreed: emptied out entirely, turned into a division, or
  // made to keep the LARGER of the two, it broke nothing that was watching.
  // It is the ceiling on every velocity the engine reports, so a wrong answer
  // here launches a ride at a speed no finger produced.
  it("passes a magnitude under the limit through, sign and all", () => {
    expect(clampMagnitude(3, 5)).toBe(3);
    expect(clampMagnitude(-3, 5)).toBe(-3);
  });

  it("cuts a magnitude over the limit down to it, keeping the direction", () => {
    expect(clampMagnitude(9, 5)).toBe(5);
    expect(clampMagnitude(-9, 5)).toBe(-5);
  });

  it("is the limit exactly at the limit", () => {
    expect(clampMagnitude(5, 5)).toBe(5);
    expect(clampMagnitude(-5, 5)).toBe(-5);
  });
});

describe("dominantMagnitude", () => {
  it("returns the argument that is larger in magnitude, signed", () => {
    expect(dominantMagnitude(2, -7)).toBe(-7);
    expect(dominantMagnitude(-7, 2)).toBe(-7);
  });

  it("keeps the FIRST argument on a tie", () => {
    // Both callers pass the live reading first and the remembered one second,
    // so a tie has to resolve to the live one: equal magnitudes with opposite
    // signs is a finger that just reversed, and the memory would send the deck
    // the way the finger no longer goes.
    expect(dominantMagnitude(5, -5)).toBe(5);
    expect(dominantMagnitude(-5, 5)).toBe(-5);
  });
});

describe("applyResistance — the shape of the lag", () => {
  it("lags harder as resistance rises, at the same pull", () => {
    const pull = 300;
    const light = applyResistance(pull, 0.3, 0.01);
    const medium = applyResistance(pull, 0.6, 0.01);
    const heavy = applyResistance(pull, 0.9, 0.01);

    expect(light).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(heavy);
  });

  it("divides the pull by the stiffness ratio, exactly", () => {
    // The stiffness is a RATIO — `safe / (1 - safe)` — so half resistance is
    // exactly 1, and the pull is divided by `1 + abs * curvature`. Reading
    // `1 + safe` instead flattens the curve, and multiplying by the divisor
    // instead of dividing runs the deck AHEAD of the finger.
    expect(applyResistance(100, 0.5, 0.01)).toBeCloseTo(
      100 / (1 + 100 * 0.01),
      10,
    );
    expect(applyResistance(100, 0.5, 0.01)).toBeLessThan(100);
  });
});
