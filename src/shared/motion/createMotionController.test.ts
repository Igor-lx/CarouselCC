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
