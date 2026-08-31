// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildProfile } from "../profile/profile";
import {
  createProfileSegment,
  sampleProfileSegment,
} from "../profile/profileSegment";
import { createMotionController } from "../runtime/createMotionController";
import { motionNow } from "../runtime/clock";
import {
  applyKeyframe,
  createCompositedRide,
} from "../compositor/compositedRide";

/**
 * The rider's contract for the canonical one-value → one-element shape:
 * composited start runs the controller passively (no per-frame emits),
 * finish parks the destination style, cancel pins the live position and
 * wakes the controller's loop, and every "compositor cannot" case falls back
 * to the active JS loop with a truthful return value.
 */

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock;
});

afterEach(() => {
  animateMock.mockReset();
  vi.useRealTimers();
});

interface FakeAnimation {
  startTime: number | null;
  cancel: () => void;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
}

const fakeAnimation = (): FakeAnimation => ({
  startTime: null,
  cancel: vi.fn(),
  onfinish: null,
  oncancel: null,
});

const segmentTo = (from: number, to: number, startedAt = 1000) =>
  createProfileSegment({
    strategy: "ride",
    from,
    to,
    profile: buildProfile({
      from,
      to,
      startSpeed: 0,
      peakSpeed: 0.01,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.4,
    }),
    startedAt,
  });

const toKeyframe = (x: number) => ({ transform: `translateX(${x}px)` });

describe("createCompositedRide", () => {
  it("composited start: origin painted, animation pinned, controller passive", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const controller = createMotionController(0);
    const emits = vi.fn();
    controller.subscribe(emits, { emitCurrent: false });

    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    const composited = ride.start({
      element,
      segment: segmentTo(0, 100),
      toKeyframe,
    });

    expect(composited).toBe(true);
    expect(ride.isComposited()).toBe(true);
    expect(anim.startTime).toBe(1000);
    // Origin pinned synchronously; passive controller emitted ONLY the
    // initial sample — no frame loop behind the compositor.
    expect(element.style.transform).toBe("translateX(0px)");
    expect(emits).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(true);
  });

  it("finish parks the destination style and drops the animation", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });

    anim.onfinish?.();
    expect(element.style.transform).toBe("translateX(100px)");
    expect(anim.cancel).toHaveBeenCalled();
    expect(ride.isComposited()).toBe(false);
  });

  it("cancel pins the given position and wakes the controller's loop", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);

    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });

    ride.cancel(42);
    expect(element.style.transform).toBe("translateX(42px)");
    expect(anim.cancel).toHaveBeenCalled();
    expect(ride.isComposited()).toBe(false);
    // wake(): the passive segment's paint came back to the frame loop.
    expect(raf).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("falls back to the ACTIVE JS loop when the compositor cannot take it", () => {
    animateMock.mockImplementation(() => {
      throw new Error("nope");
    });
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);

    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    const composited = ride.start({
      element,
      segment: segmentTo(0, 100),
      toKeyframe,
    });

    expect(composited).toBe(false);
    expect(ride.isComposited()).toBe(false);
    expect(controller.isActive()).toBe(true);
    expect(raf).toHaveBeenCalled(); // the frame loop is painting
    vi.unstubAllGlobals();
  });

  it("null element rides the JS loop without touching the DOM", () => {
    const controller = createMotionController(0);
    const ride = createCompositedRide(controller);
    const composited = ride.start({
      element: null,
      segment: segmentTo(0, 10),
      toKeyframe,
    });
    expect(composited).toBe(false);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it("a replacing start cancels the previous ride anchored at the new origin", () => {
    const first = fakeAnimation();
    const second = fakeAnimation();
    animateMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);

    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });
    ride.start({ element, segment: segmentTo(40, 200, 2000), toKeyframe });

    expect(first.cancel).toHaveBeenCalled();
    expect(second.startTime).toBe(2000);
    expect(ride.isComposited()).toBe(true);
  });
});

describe("the high-level rider surface", () => {
  it("flyTo builds the ride from the live handoff — one call, no assembly", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const controller = createMotionController(50);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller, {
      element: { current: element },
      toKeyframe,
    });

    const composited = ride.flyTo({ to: 250, cruiseSpeed: 0.5 });

    expect(composited).toBe(true);
    // Origin defaulted from the handoff (the resting value, 50)…
    expect(element.style.transform).toBe("translateX(50px)");
    // …and the animation is pinned to the handoff's clock.
    expect(typeof anim.startTime).toBe("number");
  });

  it("rider defaults free start() from repeating element/toKeyframe", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller, {
      element: { current: element },
      toKeyframe,
    });

    const composited = ride.start({ segment: segmentTo(0, 100) });
    expect(composited).toBe(true);
    expect(element.style.transform).toBe("translateX(0px)");
  });

  it("dragBinding: read catches the flying ride at its position, write feeds the finger", () => {
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);

    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller, {
      element: { current: element },
      toKeyframe,
    });
    ride.flyTo({ to: 100, cruiseSpeed: 0.5 });

    const binding = ride.dragBinding();
    const caught = binding.read();
    expect(anim.cancel).toHaveBeenCalled(); // the ride died pinned
    expect(ride.isComposited()).toBe(false);

    binding.write(caught + 12);
    expect(ride.position()).toBeCloseTo(caught + 12, 10);
    vi.unstubAllGlobals();
  });
});

describe("createCompositedRide — the browser takes the animation away", () => {
  it("lets go when the animation is cancelled from outside", () => {
    // The element is removed, the page is hidden, the engine drops the
    // animation — the rider is told through `oncancel` and nothing else. Hold
    // on to a handle the browser has already discarded and every later
    // `cancel` or `isComposited` answers about an animation that is gone.
    const anim = fakeAnimation();
    animateMock.mockReturnValue(anim);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });
    expect(ride.isComposited()).toBe(true);

    anim.oncancel?.();
    expect(ride.isComposited()).toBe(false);
  });

  it("ignores a cancel from an animation it has already replaced", () => {
    // A late callback from the PREVIOUS ride must not drop the current one:
    // the deck would stop being painted by the compositor mid-flight, with no
    // symptom until the next frame lands somewhere else.
    const first = fakeAnimation();
    animateMock.mockReturnValue(first);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });

    const second = fakeAnimation();
    animateMock.mockReturnValue(second);
    ride.start({ element, segment: segmentTo(0, 50, 2000), toKeyframe });

    first.oncancel?.();
    expect(ride.isComposited()).toBe(true);
  });
});

describe("applyKeyframe", () => {
  // jsdom's CSSStyleDeclaration silently drops anything it does not
  // implement, so a real element cannot witness a stray write at all — only a
  // recording style can say which properties were actually set.
  const recorder = () => {
    const style: Record<string, string> = {};
    return { style, element: { style } as unknown as Element };
  };

  it("writes every style the keyframe carries, stringified", () => {
    const { style, element } = recorder();
    applyKeyframe(element, { transform: "translateX(4px)", opacity: 0.5 });
    expect(style).toEqual({ transform: "translateX(4px)", opacity: "0.5" });
  });

  it("skips the keyframe's own metadata", () => {
    // `offset`, `easing` and `composite` describe the keyframe, not the
    // element — and `offset` is a real CSS shorthand, so writing it through
    // hands the element geometry nobody asked for.
    const { style, element } = recorder();
    applyKeyframe(element, {
      transform: "none",
      offset: 0.5,
      easing: "linear",
      composite: "add",
    });
    expect(Object.keys(style)).toEqual(["transform"]);
  });

  it("skips a property the caller left empty instead of stringifying it", () => {
    // A null in a keyframe means "this one is not animated". Written through,
    // it lands as the literal "null" and blanks a style set elsewhere.
    const { style, element } = recorder();
    applyKeyframe(element, {
      transform: "none",
      opacity: null,
      filter: undefined,
    });
    expect(Object.keys(style)).toEqual(["transform"]);
  });

  it("leaves an element that has no style alone", () => {
    // `Element`, not `HTMLElement`: a node from a foreign namespace carries no
    // style object at all, and the origin pin must not throw on it.
    const foreign = document.createElementNS("urn:x-carousel-test", "node");
    expect(() => applyKeyframe(foreign, { transform: "none" })).not.toThrow();
  });
});

describe("createCompositedRide — a finish from a ride already replaced", () => {
  it("does not park the old destination over the new ride", () => {
    // The mirror of the late cancel: the previous animation reports finishing
    // after it has been replaced. Park its destination and the deck jumps to
    // where the ABANDONED ride was going, mid-flight of the current one.
    const first = fakeAnimation();
    animateMock.mockReturnValue(first);
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    ride.start({ element, segment: segmentTo(0, 100), toKeyframe });

    const second = fakeAnimation();
    animateMock.mockReturnValue(second);
    ride.start({ element, segment: segmentTo(0, 40, 2000), toKeyframe });
    const pinned = element.style.transform;

    first.onfinish?.();
    expect(element.style.transform).toBe(pinned);
    expect(ride.isComposited()).toBe(true);
    expect(second.cancel).not.toHaveBeenCalled();
  });
});

describe("createCompositedRide — a rider with no defaults", () => {
  it("start() without an element rides the JS loop instead of throwing", () => {
    // `defaults` is optional, so every read of it on the way to the fallback
    // has to survive its absence — this is the shape a bare controller-only
    // rider is created with.
    animateMock.mockReturnValue(fakeAnimation());
    const controller = createMotionController(0);
    const ride = createCompositedRide(controller);

    const composited = ride.start({ segment: segmentTo(0, 100) });

    expect(composited).toBe(false);
    expect(ride.isComposited()).toBe(false);
    expect(animateMock).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(true);
  });
});
describe("the keyframes ARE the JS curve", () => {
  const pxOf = (frame: Keyframe) =>
    Number(/translateX\((-?[\d.]+)px\)/.exec(String(frame.transform))?.[1]);

  it("every keyframe carries the value the controller samples at that time", () => {
    // The compositor plays the keyframes, the controller samples the profile,
    // and a drag or a takeover reads the controller. Let the two drift apart
    // and the deck jumps the moment anything interrupts the ride — which is
    // what a wrong travel distance behind the stops quietly produces.
    animateMock.mockReturnValue(fakeAnimation());
    const controller = createMotionController(0);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller);
    const segment = segmentTo(40, 140);

    ride.start({ element, segment, toKeyframe });

    const frames = animateMock.mock.calls[0]?.[0] as Keyframe[];
    expect(frames.length).toBeGreaterThan(2);
    // WAAPI spreads offset-less keyframes evenly in TIME, so frame i is the
    // curve at i/(n-1) of the duration.
    frames.forEach((frame, i) => {
      const fraction = i / (frames.length - 1);
      const at = segment.startedAt + fraction * segment.duration;
      expect(pxOf(frame)).toBeCloseTo(
        sampleProfileSegment(segment, at).value,
        6,
      );
    });
  });
});

describe("flyTo — the ride built from the live handoff", () => {
  /** A controller genuinely in flight on the JS loop, so the handoff it hands
   * out carries a real velocity rather than a resting zero. */
  const inFlight = () => {
    vi.useFakeTimers();
    animateMock.mockImplementation(() => {
      throw new Error("compositor unavailable");
    });
    const controller = createMotionController(500);
    const element = document.createElement("div");
    const ride = createCompositedRide(controller, {
      element: { current: element },
      toKeyframe,
    });
    ride.start({ segment: segmentTo(500, 1500, motionNow()) });
    vi.advanceTimersByTime(300);

    const moving = controller.captureHandoff();
    expect(moving.velocity).toBeGreaterThan(0);

    const anim = fakeAnimation();
    animateMock.mockReset();
    animateMock.mockReturnValue(anim);
    return { ride, controller, moving, anim };
  };

  it("picks the flight up at the speed it already had", () => {
    const { ride, controller, moving } = inFlight();

    ride.flyTo({ to: moving.position + 200, cruiseSpeed: 0.5 });

    // Velocity-continuous: retargeting mid-flight must not restart from rest,
    // or the deck visibly stalls at the moment the new target is chosen.
    expect(controller.captureHandoff().velocity).toBeCloseTo(
      moving.velocity,
      6,
    );
  });

  it("drops the inherited speed when the new target is the other way", () => {
    const { ride, controller, moving } = inFlight();

    ride.flyTo({ to: moving.position - 200, cruiseSpeed: 0.5 });

    // Carrying a forward speed into a backward ride is a lurch the wrong way
    // before the curve turns around.
    expect(controller.captureHandoff().velocity).toBeCloseTo(0, 10);
  });

  it("pins the animation to the handoff's own clock", () => {
    const { ride, anim } = inFlight();

    ride.flyTo({ to: 900, cruiseSpeed: 0.5 });

    // One clock domain: the WAAPI pin, the segment and the samples all read
    // `motionNow`. A pin off by even a frame plays the ride from the wrong
    // point of the curve.
    expect(anim.startTime).toBe(motionNow());
  });

  it("honours an explicit start time — a ride already under way", () => {
    const { ride, anim } = inFlight();
    const startedAt = motionNow() - 120;

    ride.flyTo({ to: 900, cruiseSpeed: 0.5, startedAt });

    // A release hands over the timestamp of the gesture, not of the call.
    expect(anim.startTime).toBe(startedAt);
  });
});
