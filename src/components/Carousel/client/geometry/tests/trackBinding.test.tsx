// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMotionPlanChannel, type MotionPlanChannel } from "../../motion";
import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../config";
import type {
  VisualPositionFrame,
  VisualPositionSource,
} from "../../visual-position";
import { useTrackBinding, type TrackBindingApi } from "../useTrackBinding";
import type { SlotSizeSource } from "../useSlotSizeSource";

/**
 * Who is allowed to write the track's transform, and when.
 *
 * Three rules live here and all are silent when broken:
 *  - while a compositor animation owns the track, a per-frame write would
 *    fight the keyframes, so only a `geometry` re-baseline may pass;
 *  - during a no-compositor ride the track must shed EXACTLY the frames the
 *    dots and the widget shed, or the indicator drifts away from the deck;
 *  - a running compositor ride was keyframed against ONE baseline — the lane
 *    origin and the slot pixel scale. If either moves under it (a recenter, a
 *    rotation, a resize) the keyframes describe the wrong geometry, so the
 *    ride has to be torn down and the track re-pinned.
 *
 * The frame-drop rule must be gated on the PLAN's flavour, never on
 * `isWaapiSupported()`: those are different questions with different answers,
 * and the three consumers would then shed different frames. This file pins the
 * signal.
 */

const SLOT = 120;

let host: HTMLDivElement;
let root: Root;
let api: TrackBindingApi;
let plan: MotionPlanChannel;
let emit: (frame: VisualPositionFrame) => void;
let wakes: number;
let visualPosition: VisualPositionSource;

const frameAt = (
  position: number,
  runningFrameIndex: number,
): VisualPositionFrame => ({
  position,
  pageOffset: position / 3,
  velocity: 0,
  target: position,
  targetPageOffset: position / 3,
  strategy: "step",
  timestamp: 0,
  phase: "running",
  progress: 0,
  runningFrameIndex,
});

/** A visual-position source we drive by hand — the external boundary. */
const makeVisualPosition = (): VisualPositionSource => {
  const listeners = new Set<(f: VisualPositionFrame) => void>();
  let last = frameAt(0, 0);
  emit = (frame) => {
    last = frame;
    listeners.forEach((l) => l(frame));
  };
  return {
    getSnapshot: () => last,
    sampleNow: () => last.position,
    wake: () => {
      wakes += 1;
    },
    subscribe: (listener, options) => {
      listeners.add(listener);
      if (options?.emitCurrent ?? true) listener(last);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * THE slot measurement, driven by hand. `getSlotSize` and `subscribe` are
 * permanently stable exactly as the real source memoises them — the binding
 * keys its effects on them, and a fresh identity per render is the defect that
 * loses the notification in the first place.
 */
let slotValue: number | null = SLOT;
const slotListeners = new Set<() => void>();
const slotSource: SlotSizeSource = {
  getSlotSize: () => slotValue,
  slotPx: SLOT,
  subscribe: (listener) => {
    slotListeners.add(listener);
    return () => slotListeners.delete(listener);
  },
};

/** The slot moved (resize / rotation / slot-count change). */
const moveSlot = (next: number) =>
  act(() => {
    slotValue = next;
    slotListeners.forEach((listener) => listener());
  });

/**
 * jsdom ships no Web Animations API — the external boundary, and the only
 * thing stubbed here. Defined ONCE at module load, before anything can call
 * `isWaapiSupported()`, because that check caches its answer for the process.
 */
interface AnimationStub {
  cancel: Mock<() => void>;
  finish: Mock<() => void>;
  play: Mock<() => void>;
  pause: Mock<() => void>;
  currentTime: number;
  startTime: number;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  playState: string;
}

let lastAnimation: AnimationStub | null = null;
Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  writable: true,
  value: () => {
    lastAnimation = {
      cancel: vi.fn(),
      finish: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      currentTime: 0,
      startTime: 0,
      onfinish: null,
      oncancel: null,
      playState: "running",
    };
    return lastAnimation as unknown as Animation;
  },
});

const startRide = (overrides: Record<string, unknown> = {}) =>
  api.startCompositorMotion({
    from: 0,
    to: 3,
    duration: 200,
    stops: [0, 0.5, 1],
    startedAt: 0,
    ...overrides,
  });

function Probe({ layoutOrigin = 0 }: { layoutOrigin?: number }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  api = useTrackBinding({
    trackRef,
    layoutOrigin,
    visibleSlidesCount: 3,
    visualPosition,
    slotSize: slotSource,
    motionPlan: plan.source,
  });
  return <div ref={trackRef} data-track="" />;
}

const renderAt = (layoutOrigin: number) =>
  act(() => {
    root.render(<Probe layoutOrigin={layoutOrigin} />);
  });

const track = () => host.querySelector<HTMLElement>("[data-track]")!;
const transform = () => track().style.transform;

beforeEach(() => {
  wakes = 0;
  lastAnimation = null;
  slotValue = SLOT;
  slotListeners.clear();
  plan = createMotionPlanChannel();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  visualPosition = makeVisualPosition();
  act(() => {
    root.render(<Probe />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("useTrackBinding — per-frame writes", () => {
  it("paints the position it is given, in slot pixels", () => {
    act(() => emit(frameAt(2, 0)));
    expect(transform()).toBe(`translate3d(${-2 * SLOT}px, 0, 0)`);
  });

  it("disables the CSS transition once, so nothing double-animates", () => {
    expect(track().style.transition).toBe("none");
  });

  it("skips the write when the transform has not changed", () => {
    act(() => emit(frameAt(2, 0)));
    const before = transform();
    const spy = vi.spyOn(track().style, "transform", "set");
    act(() => emit(frameAt(2, 1)));
    expect(spy).not.toHaveBeenCalled();
    expect(transform()).toBe(before);
  });
});

describe("useTrackBinding — the shared frame-drop rule (B-1)", () => {
  const nth = FALLBACK_DROP_EVERY_NTH_FRAME;

  it("paints every frame of a FINGER drag", () => {
    act(() => plan.publish({ kind: "follow", isFallback: false }));
    // The frame the fallback rule would drop must still land.
    act(() => emit(frameAt(1, nth - 1)));
    expect(transform()).toBe(`translate3d(${-1 * SLOT}px, 0, 0)`);
  });

  it("sheds the shared Nth frame of a no-compositor ride", () => {
    act(() => plan.publish({ kind: "follow", isFallback: true }));
    act(() => emit(frameAt(1, 0))); // first of the streak paints
    const painted = transform();

    act(() => emit(frameAt(5, nth - 1))); // the dropped one
    expect(transform()).toBe(painted);

    act(() => emit(frameAt(6, nth))); // the next one paints again
    expect(transform()).toBe(`translate3d(${-6 * SLOT}px, 0, 0)`);
  });

  it("stops shedding when the ride hands back to a finger", () => {
    act(() => plan.publish({ kind: "follow", isFallback: true }));
    act(() => plan.publish({ kind: "follow", isFallback: false }));
    act(() => emit(frameAt(7, nth - 1)));
    expect(transform()).toBe(`translate3d(${-7 * SLOT}px, 0, 0)`);
  });

  it("does not carry the fallback flag into the next drag", () => {
    act(() => plan.publish({ kind: "follow", isFallback: true }));
    act(() => plan.publish({ kind: "idle" }));
    act(() => emit(frameAt(9, nth - 1)));
    expect(transform()).toBe(`translate3d(${-9 * SLOT}px, 0, 0)`);
  });
});

describe("useTrackBinding — compositor ownership", () => {
  it("takes the ride when the geometry is known", () => {
    expect(startRide()).toBe(true);
    expect(lastAnimation).not.toBeNull();
  });

  it("refuses the ride when there is no slot to build keyframes in", () => {
    const noSlot: SlotSizeSource = { ...slotSource, getSlotSize: () => null };
    let localApi: TrackBindingApi | null = null;
    function NoSlotProbe() {
      const trackRef = useRef<HTMLDivElement | null>(null);
      localApi = useTrackBinding({
        trackRef,
        layoutOrigin: 0,
        visibleSlidesCount: 3,
        visualPosition: makeVisualPosition(),
        slotSize: noSlot,
        motionPlan: plan.source,
      });
      return <div ref={trackRef} />;
    }
    const other = document.createElement("div");
    document.body.append(other);
    const otherRoot = createRoot(other);
    act(() => {
      otherRoot.render(<NoSlotProbe />);
    });

    expect(
      localApi!.startCompositorMotion({
        from: 0,
        to: 3,
        duration: 200,
        stops: [0, 0.5, 1],
        startedAt: 0,
      }),
    ).toBe(false);

    act(() => otherRoot.unmount());
    other.remove();
  });

  it("refuses a degenerate ride instead of building a broken animation", () => {
    // One bad input at a time: a refusal that only ever fires for the same
    // reason says nothing about the other disjuncts, and each of them is a
    // separate way to hand the compositor a broken keyframe list.
    expect(startRide({ duration: 0 })).toBe(false);
    expect(startRide({ duration: -1 })).toBe(false);
    expect(startRide({ stops: [0] })).toBe(false);
    expect(startRide({ stops: [] })).toBe(false);
    expect(startRide({ from: Number.NaN })).toBe(false);
    expect(startRide({ to: Number.NaN })).toBe(false);
    expect(startRide({ to: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("accepts the shortest curve there is — two stops", () => {
    // Two points are a straight line, which is a perfectly good ride. Reading
    // the floor as "more than two" would push every linear segment back onto
    // the JS loop for nothing.
    expect(startRide({ stops: [0, 1] })).toBe(true);
  });

  it("locks out per-frame writes while the compositor owns the track", () => {
    act(() => {
      startRide();
    });
    const pinnedAtOrigin = transform();

    act(() => emit(frameAt(2, 0)));
    expect(transform()).toBe(pinnedAtOrigin);
  });

  it("lets a geometry re-baseline through, and only that", () => {
    act(() => {
      startRide();
    });
    act(() => api.cancelCompositorMotion(2));
    expect(transform()).toBe(`translate3d(${-2 * SLOT}px, 0, 0)`);
  });

  it("hands paint back to the JS loop on cancel — a passive segment has none", () => {
    act(() => {
      startRide();
    });
    const before = wakes;
    act(() => api.cancelCompositorMotion(2));
    expect(wakes).toBe(before + 1);
  });

  it("cancelling nothing wakes nothing", () => {
    const before = wakes;
    act(() => api.cancelCompositorMotion(2));
    expect(wakes).toBe(before);
  });

  it("resumes per-frame painting once the compositor lets go", () => {
    act(() => {
      startRide();
    });
    act(() => api.cancelCompositorMotion(2));
    act(() => emit(frameAt(4, 0)));
    expect(transform()).toBe(`translate3d(${-4 * SLOT}px, 0, 0)`);
  });
});

/**
 * A compositor ride is a list of pixel keyframes, computed ONCE from two
 * things: the lane origin the transform is measured from, and the slot's pixel
 * width. Both can move while the ride is still running — a render-window
 * recenter moves the first, a rotation or resize moves the second — and the
 * keyframes then describe geometry that no longer exists.
 *
 * Nothing throws when this is missed. The ride simply finishes somewhere else:
 * a jump of the origin delta, or a whole ride played at the wrong scale.
 */
describe("useTrackBinding — the ride's baseline moving under it", () => {
  /** Put a ride in flight and leave the live position at 2 slots. */
  const rideInFlight = () => {
    act(() => {
      startRide();
    });
    act(() => emit(frameAt(2, 0)));
    return lastAnimation!;
  };

  it("tears the ride down and re-pins the track when the lane origin moves", () => {
    const animation = rideInFlight();

    renderAt(1); // the render window recentred: lanes are measured from 1 now

    expect(animation.cancel).toHaveBeenCalled();
    // Same visual position (2), one slot closer to the new origin.
    expect(transform()).toBe(`translate3d(${-(2 - 1) * SLOT}px, 0, 0)`);
  });

  it("leaves a ride alone when the origin did not actually move", () => {
    // The common case: a settle-time window shift that keeps the same origin.
    // Tearing the ride down here would be a visible hitch on every settle.
    const animation = rideInFlight();
    renderAt(0);
    expect(animation.cancel).not.toHaveBeenCalled();
  });

  it("tears the ride down and re-pins the track when the SLOT moves", () => {
    // A rotation mid-ride: the keyframes were built in the old pixel scale.
    const animation = rideInFlight();

    moveSlot(200);

    expect(animation.cancel).toHaveBeenCalled();
    expect(transform()).toBe(`translate3d(${-2 * 200}px, 0, 0)`);
  });
});

/**
 * The stub has carried `onfinish` and `oncancel` since it was written and
 * nothing ever called them: twelve mutants in this file had no coverage at
 * all. They are the ride's own ending — the moment the compositor layer is
 * handed back — and the guard inside each is the only thing keeping a ride
 * that was already replaced from repainting the track to its old destination.
 */
describe("useTrackBinding — how a compositor ride ends", () => {
  it("pins the track at the destination and lets per-frame paint back in", () => {
    // Without the final pin the track keeps whatever the last compositor frame
    // left, which is close to the target but not on it — the deck settles a
    // fraction of a pixel off, every ride.
    startRide({ from: 0, to: 3 });
    const animation = lastAnimation!;

    act(() => animation.onfinish?.());

    expect(transform()).toBe(`translate3d(${-3 * SLOT}px, 0, 0)`);
    // The layer is released, not left held for the rest of the session.
    expect(animation.cancel).toHaveBeenCalled();

    // And the JS loop owns the track again.
    act(() => emit(frameAt(1, 0)));
    expect(transform()).toBe(`translate3d(${-1 * SLOT}px, 0, 0)`);
  });

  it("ignores the finish of a ride that was already replaced", () => {
    // Two rides in a row: the first one's `onfinish` can still arrive after
    // the second has taken the track. Acting on it would yank the deck back to
    // the first ride's destination mid-flight.
    startRide({ from: 0, to: 3 });
    const first = lastAnimation!;
    startRide({ from: 0, to: 8 });
    const second = lastAnimation!;
    expect(second).not.toBe(first);

    const pinned = transform();
    act(() => first.onfinish?.());

    expect(transform()).toBe(pinned);
    // The live ride still owns the track: a per-frame write is refused.
    act(() => emit(frameAt(1, 0)));
    expect(transform()).toBe(pinned);
  });

  it("releases the track when the ride is cancelled", () => {
    startRide({ from: 0, to: 3 });
    const animation = lastAnimation!;

    act(() => animation.oncancel?.());

    act(() => emit(frameAt(1, 0)));
    expect(transform()).toBe(`translate3d(${-1 * SLOT}px, 0, 0)`);
  });

  it("ignores the cancel of a ride that was already replaced", () => {
    // The mirror of the finish guard: the superseded ride's cancel must not
    // clear the ref the LIVE ride is holding, or per-frame writes would start
    // fighting a compositor animation that is still running.
    startRide({ from: 0, to: 3 });
    const first = lastAnimation!;
    startRide({ from: 0, to: 8 });

    const pinned = transform();
    act(() => first.oncancel?.());

    act(() => emit(frameAt(1, 0)));
    expect(transform()).toBe(pinned);
  });
});

describe("useTrackBinding — freezing the track before the cancel", () => {
  it("freezes at the live compositor transform when no position is given", () => {
    // Cancelling a running animation snaps the element back to its untouched
    // style unless the current transform is written down FIRST. With no
    // explicit position to resolve, that means reading the live curve.
    startRide({ from: 0, to: 3 });
    const live = "matrix(1, 0, 0, 1, -123, 0)";
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ transform: live } as unknown as CSSStyleDeclaration);

    act(() => {
      api.cancelCompositorMotion();
    });
    spy.mockRestore();

    expect(transform()).toBe(live);
  });

  it("leaves the track alone when the live transform says nothing", () => {
    // `none` and the empty string are not positions: writing them would move
    // the deck to lane zero at the exact moment a ride is being taken over.
    startRide({ from: 0, to: 3 });
    const pinned = transform();
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ transform: "none" } as unknown as CSSStyleDeclaration);

    act(() => {
      api.cancelCompositorMotion();
    });
    spy.mockRestore();

    expect(transform()).toBe(pinned);
  });
});
