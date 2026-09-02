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
import { PAGINATION_WIDGET_DEFAULTS } from "../defaults";
import { buildPaginationWidgetGeometry } from "../math/spatialField";
import { projectDot } from "../math/projection";

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

/** CSS module names are empty strings under vitest; the `className` prop is
 *  how a host names the parts, and it is also how a test can SEE them. */
const NAMES = {
  container_PW: "strip",
  dot_PW: "dot",
  dotActive_PW: "is-active",
  activeDot_PW: "overlay",
};

const renderNamed = (
  stable: CarouselStableContextValue,
  props: Record<string, unknown> = {},
) =>
  act(() => {
    root.render(
      <CarouselStableContext.Provider value={stable}>
        <CarouselMotionContext.Provider value={motion}>
          <PaginationWidget className={NAMES} {...props} />
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

describe("<PaginationWidget> — each stream on its own", () => {
  it("goes static when only the position stream is missing", () => {
    // The two sources are nulled together by the carousel, but the component
    // is a public slot: a host wiring one and not the other must get the
    // static strip, not a binding reading a null.
    const stable = {
      ...stableWith(false, true),
      visualPosition: null,
    } as CarouselStableContextValue;
    renderNamed(stable);

    expect(container().hasAttribute("data-motion-bound")).toBe(false);
  });

  it("goes static when only the plan stream is missing", () => {
    const stable = {
      ...stableWith(false, true),
      motionPlan: null,
    } as CarouselStableContextValue;
    renderNamed(stable);

    expect(container().hasAttribute("data-motion-bound")).toBe(false);
  });
});

describe("<PaginationWidget> — the static strip", () => {
  const staticStable = () => stableWith(true, true);
  const dotsOf = () =>
    Array.from(container().querySelectorAll<HTMLElement>(".dot"));

  it("marks exactly one dot active, and it is the middle of the strip", () => {
    // The strip is re-centred on the current page every render, so the active
    // dot is always the middle one. Get the centring arithmetic wrong and the
    // marker slides off the centre — or off the strip entirely, leaving a
    // pagination with nothing marked at all.
    renderNamed(staticStable());
    const strip = dotsOf();
    const active = strip.filter((dot) => dot.classList.contains("is-active"));

    expect(active).toHaveLength(1);
    expect(strip.indexOf(active[0]!)).toBe((strip.length - 1) / 2);
  });

  it("stays centred when the deck is on a different page", () => {
    const onPageFive = {
      ...motion,
      intent: { targetPageIndex: 5 },
    };
    act(() => {
      root.render(
        <CarouselStableContext.Provider value={staticStable()}>
          <CarouselMotionContext.Provider value={onPageFive}>
            <PaginationWidget className={NAMES} />
          </CarouselMotionContext.Provider>
        </CarouselStableContext.Provider>,
      );
    });

    const strip = dotsOf();
    const active = strip.filter((dot) => dot.classList.contains("is-active"));
    expect(active).toHaveLength(1);
    expect(strip.indexOf(active[0]!)).toBe((strip.length - 1) / 2);
  });

  it("places each dot exactly where the projection says", () => {
    // The static strip has no binding to paint it later, so the transform it
    // is born with is the only one it will ever have.
    renderNamed(staticStable());
    const geometry = buildPaginationWidgetGeometry(
      PAGINATION_WIDGET_DEFAULTS.visibleDots,
      {
        size: PAGINATION_WIDGET_DEFAULTS.dotSize,
        gap: PAGINATION_WIDGET_DEFAULTS.dotGap,
        scaleFactor: PAGINATION_WIDGET_DEFAULTS.scaleFactor,
      },
    );

    const strip = dotsOf();
    const centre = (strip.length - 1) / 2;
    strip.forEach((dot, index) => {
      const projected = projectDot(1 + index - centre, 1, geometry);
      expect(dot.style.transform).toBe(
        `translate3d(${projected.x}px, 0, 0) scale(${projected.scale})`,
      );
      expect(dot.style.opacity).toBe(String(projected.opacity));
    });
  });

  it("mounts no highlight overlays — there is nothing to highlight with", () => {
    // The overlays exist for the binding to animate. In static mode they would
    // be empty elements sitting on top of the strip forever.
    renderNamed(staticStable());
    expect(container().querySelectorAll(".overlay")).toHaveLength(0);
  });
});

describe("<PaginationWidget> — the geometry it publishes to CSS", () => {
  it("carries px units, not bare numbers", () => {
    // The custom properties are consumed by `calc()` in the stylesheet; a bare
    // number there makes the whole rule invalid and the strip collapses.
    renderNamed(stableWith(false, true), { dotSize: 12, dotGap: 8 });
    const style = container().getAttribute("style") ?? "";

    expect(style).toContain("--dot-size: 12px");
    expect(style).toContain("--dots-gap: 8px");
  });
});
