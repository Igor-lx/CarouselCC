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
 * What this layer adds on top of the engine: pixels become a virtual position,
 * and a release with NO direction has to choose a destination.
 *
 * That choice is the subtle one. A finger laid on a moving deck catches it,
 * and what happens when it lets go depends on WHY it let go. A deliberate hold
 * that ends in a lift means "I wanted this slide" — land on the one under the
 * finger. The same hold ended by the page scrolling away, or by a long-press
 * menu, means nothing of the sort: the first resumes the ride the finger
 * interrupted, the second still lands on the pressed slide.
 */

const SLOT = 200;
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

let host: HTMLDivElement;
let root: Root;
let commands: CarouselCommand[];
let positions: number[];
let slotSize: number;

interface ProbeProps {
  inFlightTargetPageIndex?: number | null;
}

function Probe({ inFlightTargetPageIndex = null }: ProbeProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(0);

  const { hostProps } = useCarouselGesture({
    viewportRef,
    trackRef,
    layout: SLIDABLE,
    isSwipeOn: true,
    inFlightTargetPageIndex,
    dispatch: (command) => commands.push(command),
    readCurrentPosition: () => positionRef.current,
    applyTrackPosition: (position) => {
      positionRef.current = position;
      positions.push(position);
    },
    cancelTrackMotion: () => {},
    getSlotSize: () => slotSize,
    slotPx: SLOT,
    config,
  });

  return (
    <div {...hostProps} data-host="">
      <div ref={trackRef} data-track="" />
    </div>
  );
}

const render = (props: ProbeProps = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const pointer = (type: string, x: number, y = 100): Event => {
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

const lastEnd = () => {
  const end = commands.filter((c) => c.type === "END_DRAG").at(-1);
  if (!end || end.type !== "END_DRAG")
    throw new Error("no END_DRAG dispatched");
  return end;
};

beforeEach(() => {
  vi.useFakeTimers();
  commands = [];
  positions = [];
  slotSize = SLOT;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
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

describe("the finger becomes a position", () => {
  it("moves the deck against the finger, scaled by the slot", () => {
    // The deck follows the finger: pull right and the virtual position falls,
    // because position counts slides from the left edge. The slot is what
    // turns pixels into slides — get the sign or the divisor wrong and the
    // deck runs away from the finger or crawls behind it.
    render();
    fire(surface(), pointer("pointerdown", 300));
    // The activating move re-anchors the visual origin to the finger, so the
    // offset it reports is zero by construction: the deck starts travelling on
    // the move AFTER the one that claimed the gesture.
    fire(surface(), pointer("pointermove", 400));
    expect(positions.at(-1)!).toBe(0);

    fire(surface(), pointer("pointermove", 600));
    const afterRight = positions.at(-1)!;
    expect(afterRight).toBeLessThan(0);
    // A slot of finger travel is worth about a slide, less the drag resistance
    // the engine applies on the way.
    expect(Math.abs(afterRight)).toBeLessThan(1);
    expect(Math.abs(afterRight)).toBeGreaterThan(0.1);

    fire(surface(), pointer("pointermove", 300));
    expect(positions.at(-1)!).toBeGreaterThan(afterRight);
  });

  it("holds still when there is no slot to measure against", () => {
    // Before the first measurement a slot of zero would make every pixel an
    // infinity. The deck stays on its origin instead.
    slotSize = 0;
    render();
    fire(surface(), pointer("pointerdown", 300));
    fire(surface(), pointer("pointermove", 500));

    expect(positions.every((p) => p === 0)).toBe(true);
  });
});

describe("a release with no direction, on a deck that was already moving", () => {
  /** Catch an in-flight ride to page 3 with a finger pressed at `pressX`. */
  const catchInFlight = (pressX: number) => {
    render({ inFlightTargetPageIndex: 3 });
    fire(surface(), pointer("pointerdown", pressX));
    settleCatch();
  };

  it("lands on the slide the finger was holding", () => {
    // A deliberate hold: the user stopped the deck ON something. Pressing at
    // 700px with a 200px slot is lane 3.5 — slide 3, which is page 1.
    catchInFlight(700);
    fire(surface(), pointer("pointerup", 700));

    expect(lastEnd().targetPageIndex).toBe(1);
    // A caught ride settles as real navigation, not as a snap-back.
    expect(lastEnd().isSnap).toBe(false);
  });

  it("resumes the interrupted ride when the page scrolls the finger away", () => {
    // The finger never meant to stop the deck — it was starting a page scroll.
    // Landing on whatever it happened to touch would strand the deck halfway
    // to where it was already going.
    catchInFlight(700);
    fire(surface(), pointer("pointermove", 700, 400)); // vertical → hand-off

    expect(lastEnd().targetPageIndex).toBe(3);
  });

  it("keeps the pressed slide when a long-press menu ended the gesture", () => {
    // Same cancel, opposite meaning: the menu proves the finger was deliberate,
    // so the deliberate rule applies and the deck lands where it was held.
    catchInFlight(700);
    // The listener lives on the viewport the engine forwarded its node into —
    // the host element itself, not the container it was rendered into.
    fire(
      host.querySelector("[data-host]")!,
      new MouseEvent("contextmenu", { bubbles: true }),
    );
    fire(surface(), pointer("pointercancel", 700));

    expect(lastEnd().targetPageIndex).toBe(1);
  });

  it("falls back to the ride's own target before the deck has been measured", () => {
    // No slot means no lane and therefore no pressed slide. The destination of
    // the interrupted ride is the only thing left to honour — guessing a page
    // from an unmeasured deck would land the finger on an arbitrary slide.
    slotSize = 0;
    catchInFlight(700);
    fire(surface(), pointer("pointerup", 700));

    expect(lastEnd().targetPageIndex).toBe(3);
  });
});
