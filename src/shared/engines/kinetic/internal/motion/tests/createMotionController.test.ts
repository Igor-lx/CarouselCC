/**
 * FORK of `shared/engines/motion/tests/createMotionController.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { describe, expect, it, vi } from "vitest";

import { createMotionController } from "../runtime/createMotionController";
import { motionNow } from "../runtime/clock";
import type { MotionSegmentBase, MotionSegmentSampler } from "../runtime/types";

/** Trivial linear curve, enough to exercise the controller's sampling. */
const linearSampler: MotionSegmentSampler<MotionSegmentBase> = (
  segment,
  timestamp,
) => {
  const elapsed = Math.max(0, timestamp - segment.startedAt);
  const progress =
    segment.duration > 0 ? Math.min(1, elapsed / segment.duration) : 1;
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
    controller.subscribe((sample) => samples.push(sample.value), {
      emitCurrent: false,
    });
    controller.start({
      segment: segment({ from: 10, to: 110 }),
      sampler: linearSampler,
    });
    expect(samples).toEqual([10]);
    expect(controller.getSnapshot().phase).toBe("running");
    expect(controller.isActive()).toBe(true);
  });

  it("finalizes a degenerate zero-duration segment immediately", () => {
    const controller = createMotionController<string>(0, "idle");
    const phases: string[] = [];
    let completed = 0;
    controller.subscribe((sample) => phases.push(sample.phase), {
      emitCurrent: false,
    });
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
    controller.start({
      segment: segment({ from: 0, to: 100 }),
      sampler: linearSampler,
    });
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

  // The engine is copied into projects whose consumers it cannot see, so an
  // emit that reaches a listener registered mid-emit — or one that has just
  // left — is a defect of the emitter, not of the consumer.
  it("a listener subscribing during an emit does not receive that emit", () => {
    const controller = createMotionController<string>(0, "idle");
    const late = vi.fn();
    controller.subscribe(
      () => {
        controller.subscribe(late, { emitCurrent: false });
      },
      { emitCurrent: false },
    );

    controller.set(10);
    expect(late).not.toHaveBeenCalled();

    controller.set(20);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("a listener unsubscribing during an emit is not called after it", () => {
    const controller = createMotionController<string>(0, "idle");
    const second = vi.fn();
    const stopSecond = { current: () => {} };
    controller.subscribe(() => stopSecond.current(), { emitCurrent: false });
    stopSecond.current = controller.subscribe(second, { emitCurrent: false });

    controller.set(10);
    expect(second).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further emissions", () => {
    const controller = createMotionController<string>(0, "idle");
    let emits = 0;
    const unsubscribe = controller.subscribe(() => (emits += 1), {
      emitCurrent: false,
    });
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
    controller.set(10, {
      velocity: 2,
      target: 50,
      strategy: "drag",
      phase: "running",
      progress: 0.2,
    });
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
    controller.start({
      segment: segment({ from: 0, to: 200 }),
      sampler: linearSampler,
    });
    expect(controller.isActive()).toBe(true);
    expect(controller.captureHandoff(500).position).toBeCloseTo(100);
  });

  it("tears down just as well detached from the controller object", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.start({ segment: segment(), sampler: linearSampler });

    // Every other method survives being pulled off the object; teardown has to
    // as well, or a caller holding `const { destroy } = controller` gets a
    // TypeError at the one moment it must not fail.
    const { destroy } = controller;
    destroy();

    expect(controller.isActive()).toBe(false);
  });
});

/**
 * The controller's frame loop is a no-op without a `window` (these tests run
 * with none — see the windowless-env note above). Stub the two calls the loop
 * makes, so "did this segment register a frame callback?" becomes observable.
 */
const stubFrameLoop = () => {
  const requestAnimationFrame = vi.fn(() => 1);
  const host = globalThis as { window?: unknown };
  host.window = { requestAnimationFrame, cancelAnimationFrame: vi.fn() };
  return {
    requestAnimationFrame,
    restore: () => {
      delete host.window;
    },
  };
};

describe("passive segments (paint owned elsewhere)", () => {
  it("runs the segment with no frame loop, and still settles at its end", () => {
    vi.useFakeTimers();
    const frameLoop = stubFrameLoop();
    const controller = createMotionController<string>(0, "idle");
    const startedAt = motionNow();
    const settled = vi.fn();

    controller.start({
      segment: segment({ startedAt, duration: 1000 }),
      sampler: linearSampler,
      onComplete: settled,
      completion: "immediate",
      isPassive: true,
    });

    // The whole point: not one frame callback for the whole ride. A frame
    // callback registered per frame drags the main thread through a full paint
    // lifecycle behind a ride the compositor is already painting.
    expect(frameLoop.requestAnimationFrame).not.toHaveBeenCalled();

    // Still the position SSOT: an interruption mid-segment reads the live
    // curve, exactly as precisely as it would under a frame loop.
    expect(controller.captureHandoff(startedAt + 500).position).toBeCloseTo(50);
    expect(controller.isActive()).toBe(true);

    vi.advanceTimersByTime(1000);

    expect(frameLoop.requestAnimationFrame).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().value).toBe(100);
    expect(controller.getSnapshot().phase).toBe("settled");
    expect(controller.isActive()).toBe(false);

    frameLoop.restore();
    vi.useRealTimers();
  });

  it("does not settle a passive segment that was superseded", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const settled = vi.fn();

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
      onComplete: settled,
      completion: "immediate",
      isPassive: true,
    });

    controller.set(42);
    vi.advanceTimersByTime(2000);

    expect(settled).not.toHaveBeenCalled();
    expect(controller.getSnapshot().value).toBe(42);

    vi.useRealTimers();
  });

  it("keeps the frame loop for a non-passive segment", () => {
    const frameLoop = stubFrameLoop();
    const controller = createMotionController<string>(0, "idle");

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
    });

    expect(frameLoop.requestAnimationFrame).toHaveBeenCalled();

    controller.cancel();
    frameLoop.restore();
  });
});

describe("wake — a passive segment's paint owner disappeared", () => {
  it("resumes the frame loop and cancels the settle timer", () => {
    vi.useFakeTimers();
    const frameLoop = stubFrameLoop();
    const controller = createMotionController<string>(0, "idle");
    const settled = vi.fn();

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
      onComplete: settled,
      completion: "immediate",
      isPassive: true,
    });
    expect(frameLoop.requestAnimationFrame).not.toHaveBeenCalled();

    // Mid-flight, the compositor animation dies (geometry re-base, rotation).
    controller.wake();

    // The paint is back on the JS loop…
    expect(frameLoop.requestAnimationFrame).toHaveBeenCalledTimes(1);
    // …and the settle timer no longer fires a teleport at the segment's end:
    // finalization now belongs to the frame loop (stubbed here, so nothing
    // finalizes — which is exactly the assertion).
    vi.advanceTimersByTime(2000);
    expect(settled).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(true);

    frameLoop.restore();
    vi.useRealTimers();
  });

  it("is a no-op when idle and when already ticking", () => {
    const frameLoop = stubFrameLoop();
    const controller = createMotionController<string>(0, "idle");

    controller.wake(); // idle — nothing to resume
    expect(frameLoop.requestAnimationFrame).not.toHaveBeenCalled();

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
    });
    expect(frameLoop.requestAnimationFrame).toHaveBeenCalledTimes(1);

    controller.wake(); // already ticking — must not double the loop
    expect(frameLoop.requestAnimationFrame).toHaveBeenCalledTimes(1);

    controller.cancel();
    frameLoop.restore();
  });
});
