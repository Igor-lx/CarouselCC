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

interface RafHarness {
  flushFrame: (timestamp: number) => void;
}

const withMockedRaf = (run: (harness: RafHarness) => void) => {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis;
  };
  const hadOwnWindow = Object.prototype.hasOwnProperty.call(
    globalWithWindow,
    "window",
  );
  const originalWindow = globalWithWindow.window;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  const mockWindow = {
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      callbacks.delete(id);
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalWithWindow, "window", {
    configurable: true,
    value: mockWindow,
  });

  try {
    run({
      flushFrame(timestamp) {
        const queued = Array.from(callbacks.values());
        callbacks.clear();
        queued.forEach((callback) => callback(timestamp));
      },
    });
  } finally {
    if (hadOwnWindow) {
      Object.defineProperty(globalWithWindow, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      delete (globalWithWindow as Record<string, unknown>).window;
    }
  }
};

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

describe("clock start", () => {
  it("keeps the immediate clock as the default start mode", () => {
    withMockedRaf(({ flushFrame }) => {
      const controller = createMotionController<string>(0, "idle");
      const values: number[] = [];
      controller.subscribe((sample) => values.push(sample.value), {
        emitCurrent: false,
      });

      controller.start({ segment: segment(), sampler: linearSampler });

      expect(values).toEqual([0]);
      flushFrame(200);
      expect(values.at(-1)).toBeCloseTo(20);
    });
  });

  it("arms an after-initial-frame clock without catch-up elapsed", () => {
    withMockedRaf(({ flushFrame }) => {
      const controller = createMotionController<string>(0, "idle");
      const activeSegment = segment();
      const values: number[] = [];
      controller.subscribe((sample) => values.push(sample.value), {
        emitCurrent: false,
      });

      controller.start({
        segment: activeSegment,
        sampler: linearSampler,
        clockStart: "after-initial-frame",
      });

      expect(values).toEqual([0]);

      flushFrame(200);
      expect(values).toEqual([0, 0]);

      flushFrame(216);
      expect(values.at(-1)).toBeCloseTo(1.6);
      expect(activeSegment.startedAt).toBe(0);
    });
  });

  it("keeps captureHandoff pinned before the deferred clock is armed", () => {
    withMockedRaf(({ flushFrame }) => {
      const controller = createMotionController<string>(0, "idle");

      controller.start({
        segment: segment(),
        sampler: linearSampler,
        clockStart: "after-initial-frame",
      });

      const handoff = controller.captureHandoff(500);
      expect(handoff.position).toBe(0);
      expect(handoff.velocity).toBe(0);
      expect(handoff.timestamp).toBe(500);

      flushFrame(200);
      expect(controller.getSnapshot().value).toBe(0);

      flushFrame(216);
      expect(controller.getSnapshot().value).toBeCloseTo(1.6);
    });
  });

  it("returns a regular coherent handoff after the deferred clock is armed", () => {
    withMockedRaf(({ flushFrame }) => {
      const controller = createMotionController<string>(0, "idle");

      controller.start({
        segment: segment(),
        sampler: linearSampler,
        clockStart: "after-initial-frame",
      });

      flushFrame(200);

      const handoff = controller.captureHandoff(250);
      expect(handoff.position).toBeCloseTo(5);
      expect(handoff.velocity).toBeCloseTo(0.1);
      expect(handoff.timestamp).toBe(250);
    });
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
