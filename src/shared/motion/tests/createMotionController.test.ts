import { describe, expect, it } from "vitest";

import { createMotionController } from "../runtime/createMotionController";
import { motionNow } from "../runtime/clock";
import type { MotionSegmentBase, MotionSegmentSampler } from "../runtime/types";

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

describe("start", () => {
  it("emits the initial sample of the segment synchronously", () => {
    const controller = createMotionController<string>(0, "idle");
    const samples: number[] = [];
    controller.subscribe((sample) => samples.push(sample.value), { emitCurrent: false });
    controller.start({ segment: segment({ from: 10, to: 110 }), sampler: linearSampler });
    expect(samples).toEqual([10]);
    expect(controller.getSnapshot().phase).toBe("running");
    expect(controller.isActive()).toBe(true);
  });

  it("finalizes a degenerate zero-duration segment immediately", () => {
    const controller = createMotionController<string>(0, "idle");
    const phases: string[] = [];
    let completed = 0;
    controller.subscribe((sample) => phases.push(sample.phase), { emitCurrent: false });
    controller.start({
      segment: segment({ duration: 0, to: 70 }),
      sampler: linearSampler,
      onComplete: () => (completed += 1),
      completion: "immediate",
    });
    expect(controller.isActive()).toBe(false);
    expect(controller.getSnapshot().value).toBe(70);
    expect(controller.getSnapshot().phase).toBe("settled");
    expect(phases[phases.length - 1]).toBe("settled");
    expect(completed).toBe(1);
  });

  it("a new start replaces the running segment (retarget)", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment({ from: 0, to: 100 }), sampler: linearSampler });
    controller.start({
      segment: segment({ from: 40, to: 240, startedAt: 1000, duration: 1000 }),
      sampler: linearSampler,
    });
    // Handoff samples the NEW curve: halfway through B is 140, not anything of A.
    expect(controller.captureHandoff(1500).position).toBeCloseTo(140);
  });
});

describe("getSnapshot vs captureHandoff", () => {
  it("getSnapshot is the last EMITTED frame; captureHandoff reads the live curve", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });
    // No RAF ticks in a windowless test env — nothing was emitted since start.
    expect(controller.getSnapshot().value).toBe(0);
    expect(controller.captureHandoff(500).position).toBeCloseTo(50);
  });
});

describe("subscribe", () => {
  it("emits the current sample on subscribe by default, not with emitCurrent:false", () => {
    const controller = createMotionController<string>(7, "idle");
    let immediate = 0;
    controller.subscribe(() => (immediate += 1));
    expect(immediate).toBe(1);
    let silent = 0;
    controller.subscribe(() => (silent += 1), { emitCurrent: false });
    expect(silent).toBe(0);
  });

  it("unsubscribe stops further emissions", () => {
    const controller = createMotionController<string>(0, "idle");
    let emits = 0;
    const unsubscribe = controller.subscribe(() => (emits += 1), { emitCurrent: false });
    controller.set(5);
    unsubscribe();
    controller.set(9);
    expect(emits).toBe(1);
  });
});

describe("set", () => {
  it("kills the active segment and emits an idle sample with defaults", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });
    controller.set(33);
    expect(controller.isActive()).toBe(false);
    const snapshot = controller.getSnapshot();
    expect(snapshot.value).toBe(33);
    expect(snapshot.target).toBe(33);
    expect(snapshot.velocity).toBe(0);
    expect(snapshot.progress).toBe(1);
    expect(snapshot.phase).toBe("idle");
  });

  it("honors explicit options", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.set(10, { velocity: 2, target: 50, strategy: "drag", phase: "running", progress: 0.2 });
    const snapshot = controller.getSnapshot();
    expect(snapshot.velocity).toBe(2);
    expect(snapshot.target).toBe(50);
    expect(snapshot.strategy).toBe("drag");
    expect(snapshot.phase).toBe("running");
    expect(snapshot.progress).toBe(0.2);
  });
});

describe("snap", () => {
  it("emits a settled sample and fires onComplete", () => {
    const controller = createMotionController<string>(0, "idle");
    let completedWith: number | null = null;
    controller.snap(80, {
      onComplete: (sample) => (completedWith = sample.value),
      completion: "immediate",
    });
    expect(controller.getSnapshot().phase).toBe("settled");
    expect(controller.getSnapshot().value).toBe(80);
    expect(completedWith).toBe(80);
  });

  it("next-frame completion degrades to synchronous without a window (SSR contract)", () => {
    const controller = createMotionController<string>(0, "idle");
    let completed = 0;
    controller.snap(1, { onComplete: () => (completed += 1) }); // default: next-frame
    expect(completed).toBe(1);
  });
});

describe("cancel", () => {
  it("freezes at the live curve point as idle and never fires onComplete", () => {
    const controller = createMotionController<string>(0, "idle");
    let completed = 0;
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 60_000 }),
      sampler: linearSampler,
      onComplete: () => (completed += 1),
    });
    controller.cancel();
    expect(controller.isActive()).toBe(false);
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe("idle");
    expect(snapshot.progress).toBe(1);
    expect(snapshot.value).toBeGreaterThanOrEqual(0);
    expect(snapshot.value).toBeLessThan(1); // barely off the origin of a minute-long run
    expect(completed).toBe(0);
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
