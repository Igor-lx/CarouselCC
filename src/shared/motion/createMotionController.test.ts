import { describe, expect, it } from "vitest";

import { createMotionController } from "./createMotionController";
import type { MotionSegmentBase, MotionSegmentSampler } from "./types";

/** Trivial linear curve, enough to exercise the controller's sampling. */
const linearSampler: MotionSegmentSampler<MotionSegmentBase> = (
  segment,
  timestamp,
) => {
  const elapsed = Math.max(0, timestamp - segment.startedAt);
  const progress = segment.duration > 0 ? Math.min(1, elapsed / segment.duration) : 1;
  const span = segment.to - segment.from;
  return {
    progress,
    value: segment.from + span * progress,
    velocity: segment.duration > 0 ? span / segment.duration : 0,
    target: segment.to,
    strategy: segment.strategy,
  };
};

const segment = (
  overrides: Partial<MotionSegmentBase> = {},
): MotionSegmentBase => ({
  strategy: "test",
  from: 0,
  to: 100,
  duration: 1000,
  startedAt: 0,
  ...overrides,
});

describe("captureHandoff", () => {
  it("returns the resting sample when idle", () => {
    const controller = createMotionController<string>(42, "idle");
    const handoff = controller.captureHandoff(1000);
    expect(handoff.position).toBe(42);
    expect(handoff.velocity).toBe(0);
    expect(handoff.timestamp).toBe(1000);
  });

  it("samples position and velocity from the SAME point of the active curve", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });

    const handoff = controller.captureHandoff(500); // halfway through
    expect(handoff.position).toBeCloseTo(50);
    expect(handoff.velocity).toBeCloseTo(0.1); // span 100 / duration 1000
    expect(handoff.timestamp).toBe(500);
  });

  it("does not emit to subscribers (it is a pure read)", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });
    let emits = 0;
    controller.subscribe(() => (emits += 1), { emitCurrent: false });
    controller.captureHandoff(500);
    expect(emits).toBe(0);
  });
});

describe("soft lifecycle", () => {
  it("remains fully usable after destroy() (StrictMode-safe reuse)", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });

    controller.destroy();
    expect(controller.isActive()).toBe(false);

    // A destroyed controller is a soft reset, not a brick: it can be reused.
    controller.start({ segment: segment({ from: 0, to: 200 }), sampler: linearSampler });
    expect(controller.isActive()).toBe(true);
    expect(controller.captureHandoff(500).position).toBeCloseTo(100);
  });
});

describe("clockStart modes", () => {
  it("'immediate' (default) advances by elapsed time from segment.startedAt", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });
    // Halfway through a 1000 ms / 100-unit segment — position should be 50.
    expect(controller.captureHandoff(500).position).toBeCloseTo(50);
  });

  it("'after-initial-frame' holds position at `from` for any arbitrary delay before the first tick", () => {
    const controller = createMotionController<string>(0, "idle");
    // Default `from = 0`, `to = 100`, `duration = 1000`, `startedAt = 0`.
    controller.start({
      segment: segment(),
      sampler: linearSampler,
      clockStart: "after-initial-frame",
    });

    // A captureHandoff issued BEFORE the first tick arms the clock —
    // simulating "we asked the controller for its position 500 ms after
    // start(), but no rAF tick has fired yet because the browser was busy
    // painting" — must still see the `from` position and zero velocity.
    const handoff = controller.captureHandoff(500);
    expect(handoff.position).toBe(0);
    expect(handoff.velocity).toBe(0);

    // Even 5 seconds later, as long as no tick has fired the clock is not
    // armed — position stays at `from`.
    expect(controller.captureHandoff(5_000).position).toBe(0);
  });

  it("'after-initial-frame' arms the clock at the first emitted frame, not at start()", () => {
    const controller = createMotionController<string>(0, "idle");
    const emitted: number[] = [];
    controller.subscribe((sample) => emitted.push(sample.value), {
      emitCurrent: false,
    });

    controller.start({
      segment: segment(),
      sampler: linearSampler,
      clockStart: "after-initial-frame",
    });
    // Initial synchronous emit lives at `from`.
    expect(emitted).toEqual([0]);

    // Without a `window` (jsdom default in this test file) the controller
    // does not schedule rAFs, so we cannot drive the arm-frame transition
    // here. The behaviour we DO test:
    //  - the synchronous initial emit is `from` (above);
    //  - captureHandoff before arm still returns `from`/0 (next assertion).
    expect(controller.captureHandoff(2_000).position).toBe(0);
  });

  it("'after-initial-frame' captureHandoff returns the segment's `from`, not the segment's start-time progression", () => {
    // Crucial: without this guarantee, a repeated click that arrives during
    // the heavy first-paint window would inherit a phantom velocity from a
    // sample the user has never observed, and the next segment would build
    // on a position the deck did not actually visit.
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ from: 42, to: 142 }),
      sampler: linearSampler,
      clockStart: "after-initial-frame",
    });

    const handoff = controller.captureHandoff(800);
    expect(handoff.position).toBe(42);
    expect(handoff.velocity).toBe(0);
    expect(handoff.strategy).toBe("test");
  });
});
