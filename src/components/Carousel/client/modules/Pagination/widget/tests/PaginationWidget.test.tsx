// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  CarouselMotionContext,
  CarouselStableContext,
} from "../../../../context";
import type {
  CarouselMotionContextValue,
  CarouselStableContextValue,
} from "../../../../context";
import { createMotionPlanChannel } from "../../../../motion";
import type { VisualPositionSource } from "../../../../visual-position";
import { PaginationWidget } from "../PaginationWidget";

/**
 * The widget has TWO rendering modes and picks between them itself.
 *
 * Bound: a pool of reusable dots the binding paints imperatively, plus the
 * highlight overlays. Static: one element per projected dot, positioned from
 * the logical page, for a reader who asked not to be animated.
 *
 * Pick wrong and reduced motion gets an animated strip anyway (an
 * accessibility promise broken silently), or a healthy deck gets a frozen
 * indicator that never follows the deck. Neither throws.
 */

const trackRef = createRef<HTMLDivElement>();
const channel = createMotionPlanChannel();

const visualPosition: VisualPositionSource = {
  getSnapshot: () => ({
    position: 0,
    pageOffset: 0,
    velocity: 0,
    target: 0,
    targetPageOffset: 0,
    strategy: "idle",
    timestamp: 0,
    phase: "idle",
    progress: 0,
    runningFrameIndex: 0,
  }),
  sampleNow: () => 0,
  wake: () => {},
  subscribe: () => () => {},
};

const stableWith = (
  isReducedMotion: boolean,
  bound: boolean,
): CarouselStableContextValue => ({
  layout: {
    pageCount: 4,
    visibleSlidesCount: 3,
    isFinite: false,
    canSlide: true,
    isAtStart: false,
    isAtEnd: false,
    isTouch: true,
    isReducedMotion,
    isDataSaverEnabled: false,
    isDiagnosticActive: false,
  },
  navigation: {
    handlePrev: () => {},
    handleNext: () => {},
    handlePageSelect: () => {},
  },
  visualPosition: bound ? visualPosition : null,
  motionPlan: bound ? channel.source : null,
  slides: [],
  trackRef,
  isOffBandFetchOn: true,
  isPaginationInteractiveOn: true,
});

const motion = {
  status: {
    motionPhase: "idle",
    isIdle: true,
    isMoving: false,
    isJumping: false,
    isDragging: false,
  },
  intent: { targetPageIndex: 1 },
} as CarouselMotionContextValue;

let host: HTMLDivElement;
let root: Root;

const render = (isReducedMotion: boolean, bound = true) =>
  act(() => {
    root.render(
      <CarouselStableContext.Provider
        value={stableWith(isReducedMotion, bound)}
      >
        <CarouselMotionContext.Provider value={motion}>
          <PaginationWidget />
        </CarouselMotionContext.Provider>
      </CarouselStableContext.Provider>,
    );
  });

const container = () => host.firstElementChild as HTMLElement;
const dots = () => container().querySelectorAll("div");

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("<PaginationWidget> — picking a mode", () => {
  it("binds to motion when both streams are there and motion is wanted", () => {
    render(false);
    expect(container().getAttribute("data-motion-bound")).toBe("true");
  });

  it("falls back to a static strip under reduced motion", () => {
    render(true);
    expect(container().hasAttribute("data-motion-bound")).toBe(false);
  });

  it("falls back to a static strip when the host provides no streams", () => {
    render(false, false);
    expect(container().hasAttribute("data-motion-bound")).toBe(false);
  });
});

describe("<PaginationWidget> — what it renders", () => {
  it("mounts a reusable pool plus the highlight overlays when bound", () => {
    render(false);
    // More elements than visible dots: the pool covers the step reach on both
    // sides, and the overlays sit on top of it.
    expect(dots().length).toBeGreaterThan(5);
  });

  it("publishes its geometry to CSS as custom properties", () => {
    render(false);
    const style = container().getAttribute("style") ?? "";
    expect(style).toContain("--visible-dots-count");
    expect(style).toContain("--dot-size");
    expect(style).toContain("--dots-gap");
  });

  it("positions every static dot itself, since nothing will paint them later", () => {
    // The bound strip mounts blank elements and lets the binding write them;
    // the static one has no binding, so each dot must arrive already placed.
    // (The active-dot CLASS is not assertable here: vitest does not
    // materialise CSS module names — the class map is empty strings.)
    render(true);
    const placed = Array.from(dots()).filter((dot) =>
      (dot.getAttribute("style") ?? "").includes("translate3d"),
    );
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBe(dots().length);
  });

  it("honours a custom visible-dot count", () => {
    act(() => {
      root.render(
        <CarouselStableContext.Provider value={stableWith(false, true)}>
          <CarouselMotionContext.Provider value={motion}>
            <PaginationWidget visibleDots={7} />
          </CarouselMotionContext.Provider>
        </CarouselStableContext.Provider>,
      );
    });
    expect(container().getAttribute("style")).toContain(
      "--visible-dots-count: 7",
    );
  });
});
