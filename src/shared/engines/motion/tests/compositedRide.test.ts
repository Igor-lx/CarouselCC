// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildProfile } from "../profile/profile";
import { createProfileSegment } from "../profile/profileSegment";
import { createMotionController } from "../runtime/createMotionController";
import { createCompositedRide } from "../compositor/compositedRide";

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
