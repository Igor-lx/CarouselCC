// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/frameLoop.test.ts`, byte-identical apart from this note.
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

/**
 * The frame loop — the whole of it was unreached by any test.
 *
 * It is the path the deck rides when nothing else paints: no compositor, no
 * passive timer, just `requestAnimationFrame` walking the curve. Every project
 * that copies this shelf gets that loop, and a defect in it is not subtle —
 * the value stops advancing, or the ride never settles, or it settles twice.
 * Nothing here failed for want of a hard problem; the loop was simply never
 * driven, because driving it needs the clock faked.
 */
describe("the frame loop", () => {
  const drive = (ms: number) => vi.advanceTimersByTime(ms);

  it("walks the curve frame by frame and lands exactly on the target", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const seen: number[] = [];
    controller.subscribe((s) => seen.push(s.value), { emitCurrent: false });

    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });

    drive(400);
    const midway = controller.getSnapshot();
    expect(midway.value).toBeGreaterThan(0);
    expect(midway.value).toBeLessThan(100);
    expect(midway.phase).toBe("running");
    // More than one frame actually ran: a loop that stops after its first
    // frame still shows a moved value, and would pass a single-point check.
    expect(seen.length).toBeGreaterThan(2);

    drive(1000);
    expect(controller.getSnapshot().value).toBe(100);
    expect(controller.getSnapshot().phase).toBe("settled");
    expect(controller.isActive()).toBe(false);
    vi.useRealTimers();
  });

  it("settles once, and the completion arrives after the final frame", () => {
    // Settling twice is the failure that reads as "the deck jumped at the end":
    // a second finalize re-emits the landing and re-runs whatever the owner
    // scheduled on it.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const done = vi.fn();
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 200 }),
      sampler: linearSampler,
      onComplete: done,
    });

    drive(1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0]?.[0]).toMatchObject({
      value: 100,
      phase: "settled",
      progress: 1,
    });
    vi.useRealTimers();
  });

  it("a new ride replaces the old one instead of running beside it", () => {
    // Both loops would keep sampling their own segment and emitting into the
    // same subscribers — the value would flicker between two curves.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow(), to: 100 }),
      sampler: linearSampler,
    });
    drive(100);

    controller.start({
      segment: segment({ startedAt: motionNow(), from: 0, to: -100 }),
      sampler: linearSampler,
    });
    drive(2000);

    expect(controller.getSnapshot().value).toBe(-100);
    expect(controller.isActive()).toBe(false);
    vi.useRealTimers();
  });

  it("a cancel mid-ride stops the frames, and the value stays put", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });
    drive(400);
    const frozen = controller.getSnapshot().value;

    controller.cancel();
    drive(2000);

    expect(controller.getSnapshot().value).toBe(frozen);
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(controller.isActive()).toBe(false);
    vi.useRealTimers();
  });

  it("a curve with nothing to travel settles without ever scheduling a frame", () => {
    // A re-plan onto the position the deck already holds. The initial sample
    // is taken AT the curve's start, so "already over" cannot be expressed by
    // a past `startedAt` — it is a zero duration. Scheduling a frame for it
    // would leave a loop running against a curve with no distance in it.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const done = vi.fn();
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 0 }),
      sampler: linearSampler,
      onComplete: done,
    });

    expect(controller.isActive()).toBe(false);
    expect(controller.getSnapshot().value).toBe(100);
    drive(50);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("destroy stops delivering to anyone, and stays safe to call twice", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const seen = vi.fn();
    controller.subscribe(seen, { emitCurrent: false });
    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });
    drive(100);
    expect(seen).toHaveBeenCalled();

    controller.destroy();
    seen.mockClear();
    drive(2000);
    controller.destroy();
    controller.set(42);

    expect(seen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
