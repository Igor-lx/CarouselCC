// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselConfig } from "../../config";
import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { CarouselLayout } from "../../domain";
import type { CarouselCommand } from "../../state";
import type { Slide } from "../../public-api/types";
import { useCarouselGesture } from "../useCarouselGesture";

/**
 * The grab itself, and what the adapter tells the reducer about it.
 *
 * Taking the deck is three things in one turn: the track is pinned where it
 * visually is, the origin is remembered, and a START_DRAG is queued describing
 * it. Every number the reducer later settles from is decided here, so a wrong
 * one does not throw — the deck simply lands somewhere else.
 *
 * Everything below deliberately runs with an origin that is NOT zero and a
 * viewport that does NOT start at x = 0: both are the values that make a
 * dropped term invisible.
 */

const SLOT = 200;
const VIEWPORT_LEFT = 60;
const ORIGIN = 4;
const config = buildCarouselConfig({});

const layoutOf = (slideCount: number, visible: number): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `s${i}`,
    content: `slide ${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visible, false);
};

/** 12 slides, 3 per page → pages [0..2] [3..5] [6..8] [9..11]. */
const SLIDABLE = layoutOf(12, 3);
const STUCK = layoutOf(2, 3);

interface Seen {
  commands: CarouselCommand[];
  pinned: number[];
  painted: number[];
}

let host: HTMLDivElement;
let root: Root;
let seen: Seen;
let slotSize: number;

interface ProbeProps {
  layout?: CarouselLayout;
  isSwipeOn?: boolean;
  inFlightTargetPageIndex?: number | null;
  withViewport?: boolean;
  slotPx?: number | null;
}

function Probe({
  layout = SLIDABLE,
  isSwipeOn = true,
  inFlightTargetPageIndex = null,
  withViewport = true,
  slotPx = SLOT,
}: ProbeProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(ORIGIN);

  const { hostProps } = useCarouselGesture({
    viewportRef,
    trackRef,
    layout,
    isSwipeOn,
    inFlightTargetPageIndex,
    dispatch: (command) => seen.commands.push(command),
    readCurrentPosition: () => positionRef.current,
    applyTrackPosition: (position) => {
      positionRef.current = position;
      seen.painted.push(position);
    },
    cancelTrackMotion: (position) => {
      seen.pinned.push(position);
    },
    getSlotSize: () => slotSize,
    slotPx,
    config,
  });

  // `withViewport: false` withholds the node the engine forwards into
  // `viewportRef` — the state the very first render is in, before any DOM.
  const { ref: _ref, ...rest } = hostProps;
  return (
    <div {...(withViewport ? hostProps : rest)} data-host="">
      <div ref={trackRef} data-track="" />
    </div>
  );
}

const render = (props: ProbeProps = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const pointer = (type: string, x: number, y = 100, t?: number): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  // Without an explicit time the events land in the same millisecond and every
  // pull reads as a flick, which would commit on speed rather than distance.
  if (t !== undefined) Object.defineProperty(event, "timeStamp", { value: t });
  return event;
};

const surface = () => host.querySelector("[data-track]")!;

const fire = (target: EventTarget, event: Event) =>
  act(() => {
    target.dispatchEvent(event);
  });

/** Let the catch window elapse so a resting finger owns the deck. */
const settleCatch = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

const commandsOfType = (type: CarouselCommand["type"]) =>
  seen.commands.filter((c) => c.type === type);

const lastStart = () => {
  const start = commandsOfType("START_DRAG").at(-1);
  if (!start || start.type !== "START_DRAG")
    throw new Error("no START_DRAG dispatched");
  return start;
};

const lastEnd = () => {
  const end = commandsOfType("END_DRAG").at(-1);
  if (!end || end.type !== "END_DRAG")
    throw new Error("no END_DRAG dispatched");
  return end;
};

beforeEach(() => {
  vi.useFakeTimers();
  seen = { commands: [], pinned: [], painted: [] };
  slotSize = SLOT;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: VIEWPORT_LEFT,
    y: 0,
    width: 600,
    height: 200,
    top: 0,
    left: VIEWPORT_LEFT,
    right: VIEWPORT_LEFT + 600,
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

describe("taking the deck", () => {
  it("pins the track where it visually is, before anything moves", () => {
    // The ride has to stop THIS turn, at the position the eye already sees.
    // Skip the pin and the deck keeps animating under the finger; skip the
    // repaint and the first frame of the drag jumps back to wherever the
    // animation left the style.
    render();
    fire(surface(), pointer("pointerdown", 300));
    settleCatch();

    expect(seen.pinned).toEqual([ORIGIN]);
    expect(seen.painted).toEqual([ORIGIN]);
  });

  it("takes the deck once, however the drag was entered", () => {
    // Two entry paths reach the same grab: the press (after the catch window)
    // and the first move that claims the gesture. The second must find the
    // deck already taken — re-reading the position mid-drag would re-anchor
    // the origin to wherever the finger has already dragged it.
    render();
    fire(surface(), pointer("pointerdown", 300));
    settleCatch();
    fire(surface(), pointer("pointermove", 400));
    fire(surface(), pointer("pointermove", 500));
    fire(surface(), pointer("pointerup", 500));

    expect(seen.pinned).toEqual([ORIGIN]);
    // Once, and once only: the release flushes the deferred start again, and
    // a flush that does not notice it has nothing left to send would hand the
    // reducer a second START_DRAG describing nothing at all.
    expect(commandsOfType("START_DRAG")).toHaveLength(1);
  });

  it("describes the drag it is starting", () => {
    // An empty START_DRAG is not a crash: the reducer reads `undefined` as a
    // brand-new drag from slide 0 and settles the deck pages away.
    render();
    fire(surface(), pointer("pointerdown", 300));
    settleCatch();

    expect(lastStart().fromVirtualIndex).toBe(ORIGIN);
    // ORIGIN 4 sits on page 1 ([3..5]).
    expect(lastStart().targetPageIndex).toBe(1);
  });

  it("measures the pressed lane from the viewport's own left edge", () => {
    // The lane is `(pressX − viewportLeft) / slot`, added to the origin. Drop
    // the subtraction and every press on a carousel that is not flush with the
    // window edge lands on the wrong slide — invisible in any test whose
    // viewport starts at zero, which is why this one starts at 60.
    //
    // Press at 60 + 380 = 440. Honestly: lane 1.9 → slide floor(4 + 1.9) = 5
    // → page 1. Reading the raw client x: lane 2.5 → slide 6 → page 2. The
    // press is placed exactly where the 120px error crosses a page boundary.
    render({ inFlightTargetPageIndex: 3 });
    fire(surface(), pointer("pointerdown", VIEWPORT_LEFT + 380));
    settleCatch();
    fire(surface(), pointer("pointerup", VIEWPORT_LEFT + 380));

    expect(lastEnd().targetPageIndex).toBe(1);
  });

  it("only calls a grab an in-flight grab when a ride was actually in flight", () => {
    // The flag decides what a directionless release means. Set it always and
    // an ordinary press-and-lift on a resting deck stops being a snap-back and
    // starts navigating to whatever slide the finger happened to touch.
    render({ inFlightTargetPageIndex: null });
    fire(surface(), pointer("pointerdown", VIEWPORT_LEFT + 2 * SLOT + 20));
    settleCatch();
    fire(surface(), pointer("pointerup", VIEWPORT_LEFT + 2 * SLOT + 20));

    expect(lastEnd().isSnap).toBe(true);
    expect(lastEnd().targetPageIndex).toBe(1); // back where it was
  });
});

describe("the origin the offsets are measured from", () => {
  it("counts the finger's travel from the position the deck was taken at", () => {
    // `origin − uiOffset / slot`. Read the origin as zero and the deck
    // teleports to the top of the strip the moment the finger moves.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400)); // claims, re-anchors
    fire(surface(), pointer("pointermove", 600));

    const painted = seen.painted.at(-1)!;
    expect(painted).toBeLessThan(ORIGIN);
    expect(painted).toBeGreaterThan(ORIGIN - 1);
  });

  it("ignores a move that arrives without a drag under it", () => {
    // The surface can hand back a move after the drag was torn down (the
    // orphan path below). Painting it would drag the deck to `0 − offset`.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    const beforeOrphan = seen.painted.length;

    render({ isSwipeOn: false }); // tears the drag down mid-gesture
    fire(surface(), pointer("pointermove", 600));

    expect(seen.painted.length).toBe(beforeOrphan);
  });

  it("pins the deck at the release position before it reports the release", () => {
    // The reducer is told `fromVirtualIndex`; the paint has to agree with it,
    // or the ride starts from a pixel the deck is not on and the first frame
    // jumps.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    fire(surface(), pointer("pointermove", 600));
    // The lift lands somewhere the last move did NOT: if the release position
    // were never painted, the deck would keep the previous frame's value and
    // the assertion would compare it against itself.
    fire(surface(), pointer("pointerup", 700));

    const paintedAtRelease = seen.painted.at(-1)!;
    // `fromVirtualIndex` is optional on the command type; the adapter always
    // sends it, and a release that did not would be the same defect.
    const reported = lastEnd().fromVirtualIndex;
    expect(reported).toBeTypeOf("number");
    expect(paintedAtRelease).toBeCloseTo(reported as number, 10);
    expect(paintedAtRelease).not.toBeCloseTo(seen.painted.at(-2)!, 6);
  });
});

describe("a render that changes nothing", () => {
  it("does not drop a live drag", () => {
    // The teardown effect runs on every render; its guard is the only thing
    // that stops an ordinary parent re-render from clearing the drag origin
    // mid-gesture, which would leave the finger dragging a deck whose origin
    // is zero.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    fire(surface(), pointer("pointermove", 600));
    const beforeRerender = seen.painted.at(-1)!;

    render(); // same props, new render

    fire(surface(), pointer("pointermove", 700));
    const afterRerender = seen.painted.at(-1)!;

    // The deck still MOVES (the drag is alive) and still moves from the same
    // origin (the drag was not silently restarted): the first half fails if the
    // re-render cleared the origin, the second if it re-anchored one.
    expect(afterRerender).not.toBe(beforeRerender);
    expect(afterRerender).toBeLessThan(beforeRerender);
    expect(afterRerender).toBeLessThan(ORIGIN);
    expect(afterRerender).toBeGreaterThan(ORIGIN - 1);
  });
});

describe("the surface going away under a live drag", () => {
  it("ends an orphaned drag as a directionless release", () => {
    // Switching the gesture off mid-drag gives no `onRelease`: the adapter
    // has to close the drag itself, and it must close it as "no direction" —
    // committing a page the finger never asked for would move the deck on a
    // prop change.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    fire(surface(), pointer("pointermove", 600));

    render({ isSwipeOn: false });

    expect(lastEnd().isSnap).toBe(true);
    expect(lastEnd().targetPageIndex).toBe(1);
    expect(lastEnd().pointerReleaseVelocity).toBe(0);
  });

  it("still lands START_DRAG before the END_DRAG it orphaned", () => {
    // The deferred start has not fired yet: closing the drag without flushing
    // it first hands the reducer an END for a drag it never began.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    render({ isSwipeOn: false });

    const types = seen.commands.map((c) => c.type);
    expect(types.indexOf("START_DRAG")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("START_DRAG")).toBeLessThan(types.indexOf("END_DRAG"));
  });

  it("drops a queued start when the deck stops being slidable", () => {
    // Grabbed (so the start IS queued) and then the deck collapses to fewer
    // slides than a page. The queued START_DRAG describes a drag that will
    // never exist, so it must not fire — and a collapse is recovered by
    // reconciliation, so no END_DRAG is invented for it either.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400)); // grabs; start still pending

    render({ layout: STUCK });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(commandsOfType("START_DRAG")).toEqual([]);
    expect(commandsOfType("END_DRAG")).toEqual([]);
  });
});

describe("the adapter's own wiring", () => {
  it("hands the engine the slot-adapted tuning, not the engine defaults", () => {
    // The commit distance is delivered resolved (`swipeThresholdRatio: 0`,
    // `minSwipeDistance` = 30 % of the 200px slot = 60px). Lose the memo and
    // the engine falls back to its own host-relative rule, which on this 600px
    // viewport adapts to 36px — so a 45px pull would turn the page that the
    // carousel's own tuning leaves alone.
    //
    // Both sides are asserted: a test that only ever refuses would pass on an
    // engine that refuses everything.
    // The distance that decides is measured from the PRESS, not from the move
    // that claimed the gesture, so `travel` is the total.
    // Each pull gets its own time window: a second gesture inside the first
    // one's cooldown is refused outright and would report the first release
    // twice.
    const slowPull = (travel: number, t0: number) => {
      render({ slotPx: SLOT });
      fire(surface(), pointer("pointerdown", 300, 100, t0));
      fire(surface(), pointer("pointermove", 320, 100, t0 + 300));
      fire(surface(), pointer("pointermove", 300 + travel, 100, t0 + 600));
      fire(surface(), pointer("pointerup", 300 + travel, 100, t0 + 900));
      return lastEnd().isSnap;
    };

    expect(slowPull(45, 1000)).toBe(true); // under 60px: snaps back
    expect(slowPull(80, 9000)).toBe(false); // over it: turns the page
  });

  it("survives a first render that has no viewport node yet", () => {
    // The contextmenu listener is installed on a node that may not exist on
    // the first pass. Reading it blindly throws during the effect.
    expect(() => render({ withViewport: false })).not.toThrow();
  });

  it("stops listening for the menu once it is gone", () => {
    render();
    const viewport = host.querySelector("[data-host]") as HTMLElement;
    act(() => root.unmount());

    // The listener is off the node: dispatching on it must not reach the
    // unmounted hook.
    expect(() =>
      viewport.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
    ).not.toThrow();
  });

  it("does not dispatch a deferred start after unmounting", () => {
    // The grab has to happen first, or there is no queued dispatch to cancel
    // and the assertion holds for the wrong reason.
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 400));
    expect(commandsOfType("START_DRAG")).toEqual([]); // queued, not sent

    act(() => root.unmount());
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(commandsOfType("START_DRAG")).toEqual([]);
  });
});
