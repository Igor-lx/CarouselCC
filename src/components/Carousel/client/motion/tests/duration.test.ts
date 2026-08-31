import { describe, expect, it } from "vitest";

import { durationByVirtualSpan, resolveStepDuration } from "../duration";

/**
 * How long a duration-authored step lasts — the other half of the motion
 * system, the one that is NOT derived from a speed.
 *
 * It had no test of its own: the segment factory exercised it along the paths
 * the factory happens to take, which is how a rule this small ends up with a
 * third of it unheld. And the rules here are ones a reader would guess wrong:
 * a click stretches with the distance, autoplay does not, and a snap-back
 * ignores both.
 */

const base = {
  intent: "click-step" as const,
  segmentStartVirtualIndex: 0,
  targetVirtualIndex: 3,
  stepSize: 3,
  snapBackDurationMs: 150,
  autoplayDuration: 900,
  stepDuration: 600,
};

describe("durationByVirtualSpan", () => {
  it("scales with the distance measured in pages", () => {
    const one = durationByVirtualSpan({
      from: 0,
      to: 3,
      stepSize: 3,
      baseDuration: 600,
    });
    const two = durationByVirtualSpan({
      from: 0,
      to: 6,
      stepSize: 3,
      baseDuration: 600,
    });
    expect(one).toBe(600);
    expect(two).toBe(1200);
  });

  it("measures the distance, not its direction", () => {
    // A ride backwards is the same length of time as the same ride forwards.
    expect(
      durationByVirtualSpan({ from: 6, to: 0, stepSize: 3, baseDuration: 600 }),
    ).toBe(
      durationByVirtualSpan({ from: 0, to: 6, stepSize: 3, baseDuration: 600 }),
    );
  });

  it("falls back to the base duration when a page has no size yet", () => {
    // The page size is measured from the DOM, so it is 0 before layout. The
    // division would be Infinity and the ride would never end — the base is
    // the honest answer for "one step, length unknown".
    expect(
      durationByVirtualSpan({ from: 0, to: 3, stepSize: 0, baseDuration: 600 }),
    ).toBe(600);
    expect(
      durationByVirtualSpan({
        from: 0,
        to: 3,
        stepSize: Number.NaN,
        baseDuration: 600,
      }),
    ).toBe(600);
  });
});

describe("resolveStepDuration", () => {
  // The precedence between these — is a snap during instant mode instant or a
  // snap? — is NOT decided here any more. It belongs to `intentFromState`,
  // which is the single reading of what the motion is; this function only
  // gives each answer its length. The order test lives beside that ladder.

  it("a snap-back has its own fixed duration, whatever the distance", () => {
    // A rubber-band is a correction, not a journey: its length is a constant.
    expect(
      resolveStepDuration({
        ...base,
        intent: "snap",
        targetVirtualIndex: 30,
      }),
    ).toBe(150);
  });

  it("an instant step takes no time", () => {
    expect(
      resolveStepDuration({
        ...base,
        intent: "instant",
        targetVirtualIndex: 30,
      }),
    ).toBe(0);
  });

  it("a click stretches with the distance", () => {
    const near = resolveStepDuration({ ...base, targetVirtualIndex: 3 });
    const far = resolveStepDuration({ ...base, targetVirtualIndex: 9 });
    expect(near).toBe(600);
    expect(far).toBe(1800);
  });

  it("a gesture release is timed like a click", () => {
    expect(
      resolveStepDuration({
        ...base,
        intent: "gesture-release",
        targetVirtualIndex: 9,
      }),
    ).toBe(
      resolveStepDuration({
        ...base,
        intent: "click-step",
        targetVirtualIndex: 9,
      }),
    );
  });

  it("an autoplay tick is a fixed tempo, however far it goes", () => {
    // The deck advances on a timer, and a tick that took longer for a wider
    // page would drift out of step with the interval that scheduled it.
    expect(resolveStepDuration({ ...base, intent: "autoplay-step" })).toBe(900);
    expect(
      resolveStepDuration({
        ...base,
        intent: "autoplay-step",
        targetVirtualIndex: 30,
      }),
    ).toBe(900);
  });

  it("a move with no stated reason takes the fixed tempo, not the scaled one", () => {
    // The safe default: a duration that cannot run away with the distance.
    expect(resolveStepDuration({ ...base, intent: "unknown-step" })).toBe(900);
  });
});
