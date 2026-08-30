// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CarouselStableContext } from "../../../context";
import type { CarouselStableContextValue } from "../../../context";
import { Controls } from "../Controls";
import type { ControlsClassMap } from "../types";

/**
 * The arrows are the only affordance a keyboard or a mouse has, and the module
 * decides ENTIRELY from `isAtStart` / `isAtEnd` whether each one exists. Render
 * a zone at the end of a finite deck and it takes the click, dispatches a MOVE
 * the reducer clamps away, and the user learns the control is broken; drop one
 * a slide too early and the last slide is unreachable without a gesture.
 *
 * Nothing here throws either way, which is why it is asserted rather than read.
 */

const handlePrev = vi.fn();
const handleNext = vi.fn();

const stableAt = (
  isAtStart: boolean,
  isAtEnd: boolean,
): CarouselStableContextValue => ({
  layout: {
    pageCount: 4,
    visibleSlidesCount: 1,
    isFinite: true,
    canSlide: true,
    isAtStart,
    isAtEnd,
    isTouch: false,
    isReducedMotion: false,
    isDataSaverEnabled: false,
    isDiagnosticActive: false,
  },
  navigation: { handlePrev, handleNext, handlePageSelect: () => {} },
  visualPosition: null,
  motionPlan: null,
  slides: [],
  trackRef: { current: null },
  isOffBandFetchOn: true,
  isPaginationInteractiveOn: true,
});

let host: HTMLDivElement;
let root: Root;

const render = (
  isAtStart: boolean,
  isAtEnd: boolean,
  className?: ControlsClassMap,
) =>
  act(() => {
    root.render(
      <CarouselStableContext.Provider value={stableAt(isAtStart, isAtEnd)}>
        {className ? <Controls className={className} /> : <Controls />}
      </CarouselStableContext.Provider>,
    );
  });

const zones = () => [...host.querySelectorAll("button")];
const labels = () => zones().map((b) => b.getAttribute("aria-label"));

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  handlePrev.mockClear();
  handleNext.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("<Controls> — which zones exist", () => {
  it("offers both directions in the middle of a deck", () => {
    render(false, false);
    expect(labels()).toEqual(["Previous slide", "Next slide"]);
  });

  it("drops the backward zone at the start", () => {
    render(true, false);
    expect(labels()).toEqual(["Next slide"]);
  });

  it("drops the forward zone at the end", () => {
    render(false, true);
    expect(labels()).toEqual(["Previous slide"]);
  });

  it("renders nothing when the deck fits on one page", () => {
    // Both edges at once: a finite deck shorter than the band. A zone here
    // would dispatch a MOVE the reducer clamps to a no-op.
    render(true, true);
    expect(zones()).toHaveLength(0);
  });
});

describe("<Controls> — what a zone does", () => {
  it("routes each zone to its own handler", () => {
    render(false, false);
    const [back, forward] = zones();
    act(() => back!.click());
    expect(handlePrev).toHaveBeenCalledTimes(1);
    expect(handleNext).not.toHaveBeenCalled();
    act(() => forward!.click());
    expect(handleNext).toHaveBeenCalledTimes(1);
  });

  it("is a real button, so the keyboard reaches it without extra wiring", () => {
    render(false, false);
    for (const zone of zones()) expect(zone.type).toBe("button");
  });

  it("hides the chevron from assistive tech — the button already has a name", () => {
    render(false, false);
    for (const zone of zones()) {
      expect(zone.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("merges the host's class map onto its own instead of replacing it", () => {
    render(false, false, { navZone: "host-zone", navZoneR: "host-right" });
    const [back, forward] = zones();
    expect(back!.className).toContain("host-zone");
    expect(back!.className).not.toContain("host-right");
    expect(forward!.className).toContain("host-zone");
    expect(forward!.className).toContain("host-right");
  });
});
