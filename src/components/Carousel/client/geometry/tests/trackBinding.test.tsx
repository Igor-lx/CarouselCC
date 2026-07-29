// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMotionPlanChannel, type MotionPlanChannel } from "../../motion";
import { FALLBACK_DROP_EVERY_NTH_FRAME } from "../../config";
import type { VisualPositionFrame, VisualPositionSource } from "../../visual-position";
import { useTrackBinding, type TrackBindingApi } from "../useTrackBinding";
import type { SlotSizeSource } from "../useSlotSizeSource";

/**
 * Who is allowed to write the track's transform, and when.
 *
 * Two rules live here and both are silent when broken:
 *  - while a compositor animation owns the track, a per-frame write would
 *    fight the keyframes, so only a `geometry` re-baseline may pass;
 *  - during a no-compositor ride the track must shed EXACTLY the frames the
 *    dots and the widget shed, or the indicator drifts away from the deck.
 *
 * The second rule was gated on `isWaapiSupported()` here and on the plan's
 * flavour in the other two consumers — different questions with different
 * answers (TEST-BUGS B-1). This file pins the corrected signal.
 */

const SLOT = 120;

let host: HTMLDivElement;
let root: Root;
let api: TrackBindingApi;
let plan: MotionPlanChannel;
let emit: (frame: VisualPositionFrame) => void;
let wakes: number;

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

const slotSource: SlotSizeSource = {
  getSlotSize: () => SLOT,
  slotPx: SLOT,
  subscribe: () => () => {},
};

/**
 * jsdom ships no Web Animations API — the external boundary, and the only
 * thing stubbed here. Defined ONCE at module load, before anything can call
 * `isWaapiSupported()`, because that check caches its answer for the process.
 */
let lastAnimation: Animation | null = null;
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
    } as unknown as Animation;
    return lastAnimation;
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
  } as Parameters<TrackBindingApi["startCompositorMotion"]>[0]);

function Probe({ visualPosition }: { visualPosition: VisualPositionSource }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  api = useTrackBinding({
    trackRef,
    layoutOrigin: 0,
    visibleSlidesCount: 3,
    visualPosition,
    slotSize: slotSource,
    motionPlan: plan.source,
  });
  return <div ref={trackRef} data-track="" />;
}

const track = () => host.querySelector<HTMLElement>("[data-track]")!;
const transform = () => track().style.transform;

beforeEach(() => {
  wakes = 0;
  plan = createMotionPlanChannel();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const visualPosition = makeVisualPosition();
  act(() => {
    root.render(<Probe visualPosition={visualPosition} />);
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
    expect(startRide({ duration: 0 })).toBe(false);
    expect(startRide({ stops: [0] })).toBe(false);
    expect(startRide({ from: Number.NaN })).toBe(false);
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
