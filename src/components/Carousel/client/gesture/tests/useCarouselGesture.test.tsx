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
 * The drag's lifecycle, not its arithmetic (that lives in coast/slotAdaptive).
 *
 * The trap: `START_DRAG` is deliberately deferred to its own task, and every
 * dependent path has to flush it by hand first. Miss one flush and the reducer
 * receives an `END_DRAG` for a drag it never started — the state machine then
 * settles from the wrong origin and the deck jumps. Nothing throws.
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

const SLIDABLE = layoutOf(12, 3);

interface ProbeProps {
  layout?: CarouselLayout;
  isSwipeOn?: boolean;
}

let host: HTMLDivElement;
let root: Root;
let commands: CarouselCommand[];

function Probe({ layout = SLIDABLE, isSwipeOn = true }: ProbeProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(0);

  const { hostProps } = useCarouselGesture({
    viewportRef,
    trackRef,
    layout,
    isSwipeOn,
    inFlightTargetPageIndex: null,
    dispatch: (command) => commands.push(command),
    readCurrentPosition: () => positionRef.current,
    applyTrackPosition: (position) => {
      positionRef.current = position;
    },
    cancelTrackMotion: () => {},
    getSlotSize: () => SLOT,
    slotPx: SLOT,
    config,
  });

  // Spread whole: the engine owns the host ref and forwards the node into
  // `viewportRef` itself, exactly as the composition root does it.
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

/** jsdom's PointerEvent does not carry what the engine reads; same shape the
 * engine's own surface test uses. */
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

const press = (x: number) =>
  act(() => {
    surface().dispatchEvent(pointer("pointerdown", x));
  });
const move = (x: number) =>
  act(() => {
    surface().dispatchEvent(pointer("pointermove", x));
  });
const lift = (x: number) =>
  act(() => {
    surface().dispatchEvent(pointer("pointerup", x));
  });

const typesOf = () => commands.map((c) => c.type);

beforeEach(() => {
  vi.useFakeTimers();
  commands = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // jsdom has no layout; the engine reads the host box to size its thresholds.
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

describe("useCarouselGesture — command ordering", () => {
  it("START_DRAG always reaches the reducer before END_DRAG", () => {
    render();
    press(400);
    move(300);
    lift(280);

    const order = typesOf();
    expect(order).toContain("START_DRAG");
    expect(order).toContain("END_DRAG");
    expect(order.indexOf("START_DRAG")).toBeLessThan(order.indexOf("END_DRAG"));
  });

  it("holds the START_DRAG back one task, then delivers it", () => {
    render();
    press(400);
    move(300);
    // The grab is synchronous, the dispatch is not: this is the press-commit
    // deferral that keeps a fast swipe following the finger on a weak device.
    expect(typesOf()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(typesOf()).toEqual(["START_DRAG"]);
  });

  it("delivers exactly one START_DRAG however the drag begins", () => {
    // Both entry paths (press, and the first move) run; only one may commit.
    render();
    press(400);
    move(390);
    move(300);
    lift(280);
    expect(typesOf().filter((t) => t === "START_DRAG")).toHaveLength(1);
  });
});

describe("useCarouselGesture — the surface going away mid-drag", () => {
  it("ends an orphaned drag instead of leaving the reducer mid-gesture", () => {
    render();
    press(400);
    move(300);
    // The START_DRAG is still deferred at this point (see the ordering suite).
    expect(typesOf()).toEqual([]);

    // The host turns swiping off while the finger is still down.
    render({ isSwipeOn: false });

    // The orphan path has to FLUSH the held start before ending the drag,
    // or the reducer gets an END_DRAG for a gesture it never began.
    expect(typesOf()).toEqual(["START_DRAG", "END_DRAG"]);
  });

  it("does not invent an END_DRAG when no drag was in flight", () => {
    render();
    render({ isSwipeOn: false });
    expect(typesOf()).toEqual([]);
  });

  it("attaches no listeners at all when swiping is off", () => {
    render({ isSwipeOn: false });
    press(400);
    move(300);
    lift(280);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(typesOf()).toEqual([]);
  });

  it("stays inert on a deck too short to slide", () => {
    render({ layout: layoutOf(2, 3) });
    press(400);
    move(300);
    lift(280);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(typesOf()).toEqual([]);
  });
});

describe("useCarouselGesture — teardown", () => {
  it("drops the pending START_DRAG when the carousel unmounts first", () => {
    render();
    press(400);
    expect(typesOf()).toEqual([]); // still deferred

    act(() => root.unmount());
    root = createRoot(host);

    act(() => {
      vi.advanceTimersByTime(0);
    });
    // Dispatching into an unmounted reducer would be a stray state update.
    expect(typesOf()).toEqual([]);
  });
});
