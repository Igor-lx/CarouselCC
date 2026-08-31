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
import { act, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselConfig } from "../config";
import type { CarouselRuntimeConfig } from "../config";
import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { TrackBindingApi } from "../geometry";
import type { CarouselLayout } from "../domain";
import { useCarouselGesture } from "../gesture";
import {
  createMotionPlanChannel,
  useCarouselMotionExecution,
  type CarouselMotionPlan,
} from "../motion";
import { useCarouselNavigation, type CarouselNavigation } from "../navigation";
import { useCarouselState } from "../state";
import type { CarouselState } from "../state";
import { useVisualPosition } from "../visual-position";
import type { Slide } from "../public-api/types";

/**
 * The scenarios of `05-flows.md`, played against the real chain: a pointer or a
 * click goes in, the reducer decides, the runner plans, and the controller is
 * the position of record. Only the two things outside the component are
 * replaced — the compositor, which is the browser, and the slot width, which
 * jsdom cannot lay out.
 *
 * Everything else in this suite proves a node in isolation. This file proves
 * they meet: a gesture that resolves against a stale position, a catch that
 * anchors on the wrong page, a repeat that accumulates the wrong way — each
 * passes every other test in the project and none of them is visible without
 * the whole chain running.
 *
 * The clock is the motion clock (`motionNow`), and fake timers drive it, so a
 * ride is played rather than assumed: advance the clock and the deck is
 * genuinely mid-flight, at a position the controller computed.
 *
 * Deliberately not here: pixels and frame timing. That is a screenshot bench,
 * and a different (later) job.
 */

const SLOT = 200;
const config: CarouselRuntimeConfig = buildCarouselConfig({});

const layoutOf = (
  slideCount: number,
  visible: number,
  isFinite: boolean,
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `s${i}`,
    content: `slide ${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visible, isFinite);
};

/** 12 slides, 3 to a page, cyclic — 4 pages, one lane per slide. */
const CYCLIC = layoutOf(12, 3, false);

let host: HTMLDivElement;
let root: Root;
let channel: ReturnType<typeof createMotionPlanChannel>;
let plans: CarouselMotionPlan[];
let startCompositorMotion: Mock<TrackBindingApi["startCompositorMotion"]>;
let cancelCompositorMotion: Mock<TrackBindingApi["cancelCompositorMotion"]>;

/** What the probe hands back to the test after every commit. */
interface Live {
  state: CarouselState;
  navigation: CarouselNavigation;
  position: () => number;
}
let live: Live;

function Probe({ layout = CYCLIC }: { layout?: CarouselLayout }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const { state, status, dispatch } = useCarouselState({
    layout,
    config,
    isInstantMode: false,
  });

  const {
    source: visualPosition,
    controller,
    applyImmediatePosition,
  } = useVisualPosition({ visibleSlidesCount: layout.visibleSlidesCount });

  // The composition root reads a live sample while the compositor paints and
  // the snapshot otherwise (`geometry/useTrackBinding.ts`). Same split here,
  // keyed on the controller instead of an animation handle.
  const readCurrentPosition = useCallback(
    () =>
      controller.isActive()
        ? visualPosition.sampleNow()
        : visualPosition.getSnapshot().position,
    [controller, visualPosition],
  );

  useCarouselMotionExecution({
    state,
    config,
    controller,
    dispatch,
    isInstantMode: false,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan: channel.publish,
  });

  const navigation = useCarouselNavigation({
    enabled: layout.canSlide,
    dispatch,
    readCurrentPosition,
  });

  const { hostProps } = useCarouselGesture({
    viewportRef,
    trackRef,
    layout,
    isSwipeOn: true,
    // Exactly the composition root's expression (`Carousel.tsx:265`).
    inFlightTargetPageIndex: status.isIdle ? null : state.targetPageIndex,
    dispatch,
    readCurrentPosition,
    applyTrackPosition: applyImmediatePosition,
    cancelTrackMotion: cancelCompositorMotion,
    getSlotSize: () => SLOT,
    slotPx: SLOT,
    config,
  });

  live = { state, navigation, position: readCurrentPosition };

  return (
    <div {...hostProps} data-host="">
      <div ref={trackRef} data-track="" />
    </div>
  );
}

const render = (layout: CarouselLayout = CYCLIC) =>
  act(() => {
    root.render(<Probe layout={layout} />);
  });

// --- driving the deck -------------------------------------------------------

/** jsdom's PointerEvent carries none of what the engine reads. */
const pointer = (type: string, x: number): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  return event;
};

const surface = () => host.querySelector("[data-track]")!;
const fire = (type: string, x: number) =>
  act(() => {
    surface().dispatchEvent(pointer(type, x));
  });

const press = (x: number) => fire("pointerdown", x);
const move = (x: number) => fire("pointermove", x);
const lift = (x: number) => fire("pointerup", x);
const cancel = (x: number) => fire("pointercancel", x);

/** Let the deferred START_DRAG land, the way every dependent path must. */
const flushStart = () =>
  act(() => {
    vi.advanceTimersByTime(0);
  });

/** Advance the motion clock — the deck genuinely travels. */
const ride = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const click = (step: number) =>
  act(() => {
    live.navigation.move(step, "click");
  });

const autoplayTick = () =>
  act(() => {
    live.navigation.move(1, "autoplay");
  });

const goTo = (pageIndex: number) =>
  act(() => {
    live.navigation.goTo(pageIndex, "click");
  });

/** A whole ride, from wherever it is to rest. */
const settle = () => ride(5000);

beforeEach(() => {
  vi.useFakeTimers();
  plans = [];
  channel = createMotionPlanChannel();
  channel.source.subscribe((plan) => plans.push(plan));
  // The compositor is the external boundary: spied, and it takes every ride.
  startCompositorMotion = vi.fn(() => true);
  cancelCompositorMotion = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // jsdom lays nothing out; the engine reads the host box for its thresholds.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 600,
    height: 200,
    top: 0,
    left: 0,
    right: 600,
    bottom: 200,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// --- driving notes ---------------------------------------------------------
//
// Three engine facts decide the shape of every case below; each was measured
// against the running deck, not assumed.
//
//  * a step lasts `durationStep` = 2000 ms, so "mid-flight" means hundreds of
//    milliseconds in, not tens;
//  * a press becomes a drag only once the finger crosses `intentThreshold`
//    (8 px) — and the engine then RE-ANCHORS the drag origin to the finger, so
//    the travelled distance is measured from the move that crossed it;
//  * a resting finger has to outlast the 250 ms catch window to own the strip,
//    and every gesture is followed by a 150 ms cooldown in which the next press
//    is ignored.

/** Mid-flight: far enough in to be moving, far short of the landing. */
const MID_FLIGHT_MS = 900;
/** Longer than the catch window, so a still finger owns the strip. */
const CATCH_MS = 300;
/** Longer than the engine's cooldown, so the next gesture is heard. */
const COOLDOWN_MS = 300;

/** A committed swipe: cross the intent threshold, travel, release. */
const swipe = (from: number, to: number) => {
  const step = to > from ? 12 : -12;
  press(from);
  move(from + step); // crosses the 8px threshold; origin re-anchors here
  flushStart();
  move(to);
  lift(to);
};

// --- 1. click from rest -----------------------------------------------------

describe("сценарий 1 — клик по стрелке из покоя", () => {
  it("advances one page and comes to rest on it", () => {
    render();
    click(1);
    expect(live.state.targetPageIndex).toBe(1);
    expect(live.state.virtualIndex).toBe(3);
    expect(live.state.motionPhase).toBe("step-normal");
    expect(startCompositorMotion).toHaveBeenCalledTimes(1);

    settle();
    expect(live.state.motionPhase).toBe("idle");
    // The landing is where the deck aimed, not where the curve happened to end.
    expect(live.position()).toBe(3);
  });

  it("plans exactly one ride for one click", () => {
    render();
    click(1);
    settle();
    // A second plan here is a ride restarted from its own midpoint — the lurch
    // that no unit test in this project can see.
    expect(plans.filter((plan) => plan.kind === "waapi")).toHaveLength(1);
  });
});

// --- 2. repeated click ------------------------------------------------------

describe("сценарий 2 — повторный клик в ту же сторону", () => {
  it("retargets from what the eye sees, not from where the ride was aimed", () => {
    render();
    click(1); // aimed at page 1, lane 3
    ride(MID_FLIGHT_MS);
    const seen = live.position();
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(3);

    click(1);
    expect(live.state.isRepeatedClickAdvance).toBe(true);
    // Two pages ahead of the page the eye is on — which is still page 0.
    expect(live.state.targetPageIndex).toBe(2);
  });

  it("a burst never runs further ahead than the lookahead allows", () => {
    render();
    click(1);
    for (let i = 0; i < 8; i += 1) {
      ride(200);
      click(1);
    }
    // Eight more clicks, and the deck is still within the lookahead of what is
    // on screen. Anchored on the target instead, this reads page 9 of 4.
    const visiblePage = Math.floor(live.position() / 3);
    expect(live.state.targetPageIndex).toBe((visiblePage + 2) % 4);
  });
});

// --- 3. swipe from rest -----------------------------------------------------

describe("сценарий 3 — свайп из покоя", () => {
  it("commits one page in the direction of the finger", () => {
    render();
    swipe(400, 280);

    expect(live.state.targetPageIndex).toBe(1);
    // A committed swipe is a navigation, not a snap-back to where it started.
    expect(live.state.motionPhase).toBe("step-normal");
    settle();
    expect(live.position()).toBe(3);
  });

  it("launches from where the finger left the deck, not from the page edge", () => {
    render();
    swipe(400, 280);
    // The exact offset is engine tuning (resistance, and the re-anchor above),
    // so what is pinned is the property: the ride starts inside the page the
    // finger dragged into, not snapped back to its edge. Launch from 0 and the
    // deck visibly jumps backwards before setting off.
    expect(live.state.fromVirtualIndex).toBeGreaterThan(0);
    expect(live.state.fromVirtualIndex).toBeLessThan(1);
  });
});

// --- 4. catching a ride -----------------------------------------------------

describe("сценарий 4 — перехват летящей колоды", () => {
  it("settles on the page under the finger, and calls it a navigation", () => {
    render();
    click(2); // aimed at page 2
    ride(MID_FLIGHT_MS);
    // Press on the right of the viewport and hold: 500px over a 200px slot is
    // 2.5 lanes in, which puts the finger on page 1 of the deck.
    press(500);
    flushStart();
    ride(CATCH_MS);
    lift(500);

    expect(live.state.targetPageIndex).toBe(1);
    // Not "step-snap": a catch is a real move, and a snap-back profile here
    // reads as the deck refusing the touch.
    expect(live.state.motionPhase).toBe("step-normal");
  });

  it("resumes the interrupted ride when the browser takes the pointer", () => {
    render();
    click(2);
    ride(MID_FLIGHT_MS);
    press(400);
    flushStart();
    ride(CATCH_MS);
    // A page scroll crossed the strip: no direction, no menu, and the pointer
    // is gone. A false catch, so the ride goes back to ITS destination rather
    // than to whatever page the finger happened to rest on.
    cancel(400);
    expect(live.state.targetPageIndex).toBe(2);
  });
});

// --- 5. repeated swipe ------------------------------------------------------

describe("сценарий 5 — повторный свайп", () => {
  it("with the travel, advances one page past the ride's destination", () => {
    render();
    click(1); // destination page 1
    ride(MID_FLIGHT_MS);
    swipe(400, 280);
    expect(live.state.targetPageIndex).toBe(2);
  });

  it("against the travel, retreats one page from it", () => {
    render();
    click(1);
    ride(MID_FLIGHT_MS);
    swipe(280, 400);
    expect(live.state.targetPageIndex).toBe(0);
  });

  it("gets no two-page lookahead — a swipe is not a click", () => {
    // The asymmetry is deliberate and easy to "fix" into a bug. A swipe never
    // reaches the lookahead at all — it arrives as END_DRAG, and the branch is
    // reachable only from MOVE — so what is worth holding here is the OUTCOME:
    // one page per swipe, accumulating, against the click's cap of two.
    render();
    click(1);
    ride(MID_FLIGHT_MS);
    swipe(400, 280);
    expect(live.state.isRepeatedClickAdvance).toBe(false);
    expect(live.state.moveReason).toBe("gesture");

    // One page per swipe, and nothing caps the accumulation the way the click
    // lookahead caps its own.
    ride(COOLDOWN_MS);
    swipe(400, 280);
    expect(live.state.targetPageIndex).toBe(3);
  });
});

// --- 6. autoplay ------------------------------------------------------------

describe("сценарий 6 — автоплей", () => {
  it("goes through the same door as a click", () => {
    render();
    autoplayTick();
    expect(live.state.targetPageIndex).toBe(1);
    expect(live.state.moveReason).toBe("autoplay");
    settle();
    expect(live.position()).toBe(3);
  });

  it("a click over an autoplay ride repeats it — the origin is not an input", () => {
    // Nothing on the retarget path reads moveReason, so a ride started by the
    // timer is treated exactly like one started by a finger.
    render();
    autoplayTick();
    ride(MID_FLIGHT_MS);
    click(1);
    expect(live.state.isRepeatedClickAdvance).toBe(true);
    expect(live.state.moveReason).toBe("click");
  });

  it("never repeats itself — the lookahead is for a finger, not a timer", () => {
    // `moveReason === "click"` is the whole guard here, and nothing else in the
    // suite exercises it. Let the timer take the lookahead and an unattended
    // deck accelerates away from the viewer two pages at a time.
    // Set up the one state where the two rules disagree: a repeated click has
    // put the target two pages ahead of the page on screen. An ordinary step
    // then aims at target + 1 = 3; the lookahead would aim at visible + 2 = 2.
    render();
    click(1);
    ride(MID_FLIGHT_MS);
    click(1);
    expect(live.state.targetPageIndex).toBe(2);
    expect(Math.floor(live.position() / 3)).toBe(0);

    autoplayTick();
    expect(live.state.isRepeatedClickAdvance).toBe(false);
    expect(live.state.targetPageIndex).toBe(3);
  });

  it("a swipe catches an autoplay ride the same way it catches a click's", () => {
    render();
    autoplayTick();
    ride(MID_FLIGHT_MS);
    swipe(400, 280);
    expect(live.state.targetPageIndex).toBe(2);
    expect(live.state.moveReason).toBe("gesture");
  });
});

// --- 7. far jump ------------------------------------------------------------

describe("сценарий 7 — дальний переход", () => {
  const BIG = layoutOf(24, 3, false); // 8 pages

  it("far enough to teleport: flies a preflight, cuts the middle, approaches", () => {
    render(BIG);
    goTo(5);
    // The render window is built from virtualIndex, so the far target must not
    // leak into it — it waits in teleportVirtualIndex while the preflight flies.
    expect(live.state.motionPhase).toBe("step-jump");
    expect(live.state.teleportVirtualIndex).toBe(15);
    expect(live.state.virtualIndex).toBe(3);

    settle();
    // The middle is cut: the deck is now anchored on the canonical landing and
    // still jumping, with the approach segment left to fly. One ride here
    // instead of two means the deck crossed every intermediate page on screen.
    expect(live.state.virtualIndex).toBe(15);
    expect(live.state.teleportVirtualIndex).toBeNull();
    expect(live.state.isTeleportApproach).toBe(true);
    expect(live.state.motionPhase).toBe("step-jump");
    expect(live.position()).toBeLessThan(15);

    settle();
    expect(live.state.motionPhase).toBe("idle");
    expect(live.state.isTeleportApproach).toBe(false);
    expect(live.position()).toBe(15);
  });

  it("too short to teleport: one segment, no cut", () => {
    render(BIG);
    goTo(2);
    expect(live.state.motionPhase).toBe("step-jump");
    expect(live.state.teleportVirtualIndex).toBeNull();
    expect(live.state.virtualIndex).toBe(6);

    settle();
    expect(live.state.motionPhase).toBe("idle");
    expect(plans.filter((plan) => plan.kind === "waapi")).toHaveLength(1);
    expect(live.position()).toBe(6);
  });
});
