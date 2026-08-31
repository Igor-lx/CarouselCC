// @vitest-environment jsdom
/**
 * FORK of `shared/engines/motion/tests/compositedRide.test.ts` — and the one
 * fork in this folder that is NOT a copy.
 *
 * The rider was trimmed here: no `flyTo`, no `dragBinding`, no rider defaults,
 * and `element`/`toKeyframe` are required rather than optional. So the
 * original's "high-level rider surface" block has nothing to address, and the
 * calls below pass both fields explicitly. What remains is the part the
 * kinetic facade actually rides on, asserted against THIS copy.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildProfile } from "../profile/profile";
import { createProfileSegment } from "../profile/profileSegment";
import { createMotionController } from "../runtime/createMotionController";
import {
  applyKeyframe,
  createCompositedRide,
} from "../compositor/compositedRide";

const animateMock = vi.fn();

beforeAll(() => {
  Element.prototype.animate = animateMock;
});

afterEach(() => {
  animateMock.mockReset();
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

describe("createCompositedRide (the kinetic fork)", () => {
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

describe("applyKeyframe (the kinetic fork)", () => {
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
