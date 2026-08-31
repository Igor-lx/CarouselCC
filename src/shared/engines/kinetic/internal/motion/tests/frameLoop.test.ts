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

/**
 * What must stop when something else takes over.
 *
 * Every entry point that changes the position — `set`, `snap`, a new `start` —
 * first cancels what was running: the frame loop, the passive settle timer and
 * any completion already queued for the ride being replaced. None of those
 * cancels was observed by a test, because observing them means asking what
 * happens AFTER the takeover, and every existing case stopped at the takeover
 * itself.
 *
 * The failures are all of one shape: something from the previous ride arrives
 * late. A loop that kept running overwrites the value that was just set; a
 * completion left queued reports a landing for a ride nobody is on any more.
 */
describe("takeover — what the previous ride must stop doing", () => {
  const drive = (ms: number) => vi.advanceTimersByTime(ms);

  it("a set stops the frames, and the value it wrote stays written", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });
    drive(200);

    controller.set(42);
    drive(2000);

    // A loop still running would sample its own curve over the top of this.
    expect(controller.getSnapshot().value).toBe(42);
    expect(controller.isActive()).toBe(false);
    vi.useRealTimers();
  });

  it("a snap stops the frames the same way", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });
    drive(200);

    controller.snap(7);
    drive(2000);

    expect(controller.getSnapshot().value).toBe(7);
    expect(controller.getSnapshot().phase).toBe("settled");
    vi.useRealTimers();
  });

  it("a passive ride's settle timer is dropped when something takes over", () => {
    // A passive segment has no frame loop — one timer at the end is the whole
    // ride. Leave it armed and the deck "lands" seconds after it was placed
    // somewhere else entirely, reporting a landing nobody is waiting for.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const stale = vi.fn();
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
      onComplete: stale,
      isPassive: true,
    });
    drive(200);

    controller.set(0);
    drive(5000);

    expect(stale).not.toHaveBeenCalled();
    expect(controller.getSnapshot().value).toBe(0);
    vi.useRealTimers();
  });

  it("a completion queued by a snap is dropped by the next snap", () => {
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const stale = vi.fn();
    controller.snap(5, { onComplete: stale });
    controller.snap(9);
    drive(100);

    expect(stale).not.toHaveBeenCalled();
    expect(controller.getSnapshot().value).toBe(9);
    vi.useRealTimers();
  });

  it("an immediate completion arrives inside the call, not a frame later", () => {
    // The caller asked for it synchronously because it is already inside the
    // commit that owns the outcome; a frame later is a different commit.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const immediate = vi.fn();
    const deferred = vi.fn();

    controller.snap(1, { onComplete: immediate, completion: "immediate" });
    expect(immediate).toHaveBeenCalledTimes(1);

    controller.snap(2, { onComplete: deferred });
    expect(deferred).not.toHaveBeenCalled();
    drive(50);
    expect(deferred).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("set and snap — what they fill in when the caller does not", () => {
  it("a bare set rests: no velocity, target on the value, strategy kept", () => {
    // The defaults are the whole contract of "put it here": anything else
    // leaves a consumer reading a speed for a deck that is standing still.
    const controller = createMotionController<string>(0, "gesture");
    controller.set(12);
    expect(controller.getSnapshot()).toMatchObject({
      value: 12,
      velocity: 0,
      target: 12,
      strategy: "gesture",
      phase: "idle",
      progress: 1,
    });
  });

  it("a bare snap rests too, but reads as settled rather than idle", () => {
    const controller = createMotionController<string>(0, "step");
    controller.snap(3);
    expect(controller.getSnapshot()).toMatchObject({
      value: 3,
      velocity: 0,
      target: 3,
      strategy: "step",
      phase: "settled",
    });
  });

  it("what the caller does pass is not overwritten", () => {
    const controller = createMotionController<string>(0, "idle");
    controller.set(5, { velocity: 2, target: 9, strategy: "gesture" });
    expect(controller.getSnapshot()).toMatchObject({
      value: 5,
      velocity: 2,
      target: 9,
      strategy: "gesture",
    });
  });
});

describe("captureHandoff — the point a takeover starts from", () => {
  const drive = (ms: number) => vi.advanceTimersByTime(ms);

  it("answers from the live curve while the ride is on", () => {
    // Not from the last emitted frame: a takeover that starts from the frame
    // BEFORE the one on screen begins with a visible step backwards.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow() }),
      sampler: linearSampler,
    });
    drive(300);

    const ahead = controller.captureHandoff(motionNow() + 100);
    expect(ahead.position).toBeGreaterThan(controller.getSnapshot().value);
    vi.useRealTimers();
  });

  // The handoff also caches what it sampled (`if (active) sample = point`), and
  // that cache is deliberately NOT pinned: every path out of an active ride —
  // `cancel`, `set`, `snap`, `finalize` — emits, and an emit writes the same
  // field. There is no state in which the cache is the only writer, so a test
  // for it would be pinning an internal, not a behaviour.
});

/**
 * A landing announced for a ride nobody is on.
 *
 * A settled ride hands its `onComplete` to the next frame — the host reads the
 * outcome one commit later, where it can act on it. Between the settle and
 * that frame the deck can be sent somewhere else entirely, and the queued
 * completion is then a report about a ride that was replaced: the host advances
 * a page it already left, or announces a landing on a slide it flew past.
 *
 * One test per way of replacing it, because each entry point drops the queue
 * itself — there is no shared choke point that would make one case stand for
 * the others.
 */
describe("takeover — a completion queued for a ride that is gone", () => {
  const drive = (ms: number) => vi.advanceTimersByTime(ms);

  /** A ride settled on its own, with its completion still queued for the
   * next frame. */
  const settledWithCompletionPending = () => {
    const controller = createMotionController<string>(0, "idle");
    const landed = vi.fn();
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 100 }),
      sampler: linearSampler,
      onComplete: landed,
    });
    // Frame by frame only until it settles: the completion goes on the NEXT
    // frame, and driving past that would deliver it before the takeover.
    for (let i = 0; i < 20 && controller.isActive(); i += 1) drive(16);
    expect(controller.isActive()).toBe(false);
    expect(landed).not.toHaveBeenCalled();
    return { controller, landed };
  };

  it("is dropped by a new ride", () => {
    vi.useFakeTimers();
    const { controller, landed } = settledWithCompletionPending();

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
    });
    drive(2000);

    expect(landed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("is dropped by a set", () => {
    vi.useFakeTimers();
    const { controller, landed } = settledWithCompletionPending();

    controller.set(42);
    drive(2000);

    expect(landed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("is dropped by a cancel", () => {
    vi.useFakeTimers();
    const { controller, landed } = settledWithCompletionPending();

    controller.cancel();
    drive(2000);

    expect(landed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("one ride, one loop", () => {
  const drive = (ms: number) => vi.advanceTimersByTime(ms);

  it("a replacing ride does not leave the old loop running beside it", () => {
    // Every tick schedules the next one, so a loop that was not cancelled does
    // not merely waste a frame — it doubles. Two loops become four, and within
    // a second the deck is sampling its curve dozens of times per frame.
    vi.useFakeTimers();
    const controller = createMotionController<string>(0, "idle");
    const seen = vi.fn();
    controller.subscribe(seen, { emitCurrent: false });

    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 5000 }),
      sampler: linearSampler,
    });
    drive(100);
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 5000, to: 50 }),
      sampler: linearSampler,
    });
    const afterRestart = seen.mock.calls.length;

    drive(160); // ten frames
    const perFrame = (seen.mock.calls.length - afterRestart) / 10;
    expect(perFrame).toBeLessThanOrEqual(1);
    vi.useRealTimers();
  });

  it("a frame that arrives after the ride was replaced paints nothing", () => {
    // `cancelAnimationFrame` cannot retract a callback the browser has already
    // dispatched for the frame it is running: a `set` from inside one frame
    // callback does not stop the tick queued beside it. That tick must find
    // the ride gone and do nothing, or it repaints the curve over the value
    // just written.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      // a dispatched batch cannot be un-queued
    });

    const controller = createMotionController<string>(0, "idle");
    controller.start({
      segment: segment({ startedAt: motionNow(), duration: 1000 }),
      sampler: linearSampler,
    });
    const seen = vi.fn();
    controller.subscribe(seen, { emitCurrent: false });

    controller.set(42);
    expect(seen).toHaveBeenCalledTimes(1);

    // The tick the ride queued before it was replaced, arriving anyway.
    frames.at(-1)?.(motionNow() + 16);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().value).toBe(42);
    vi.unstubAllGlobals();
  });
});
