// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The reducer owns its context, so a state fixture carries the defaults. */
const initialStateFor = (layout: Parameters<typeof buildInitialState>[0]) =>
  buildInitialState(layout, buildCarouselConfig({}));

import { buildCarouselConfig } from "../../config";
import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { CarouselLayout } from "../../domain";
import { buildInitialState } from "../../state/initial";
import type { CarouselState, MoveReason } from "../../state";
import type { CarouselNavigation } from "../../navigation";
import type { Slide } from "../../public-api/types";
import { useCarouselAutoplay } from "../useCarouselAutoplay";

/**
 * `useAutoplay` owns the timer; THIS hook owns the answer to "should it be
 * running at all". That answer is an AND of five separate signals, and every
 * one of them is a real bug when wired wrong: a deck that advances under the
 * finger, one that keeps stepping off screen and burns battery, one that ticks
 * during its own ride and double-steps, or one that simply never starts.
 *
 * The composition is what is tested here, not the timer (covered next door)
 * and not the visibility source (covered in the shelf).
 */

const config = buildCarouselConfig({});

const layoutOf = (slideCount: number, visible: number): CarouselLayout =>
  buildCarouselLayout(
    buildSlideRecords(
      Array.from({ length: slideCount }, (_, i): Slide => ({
        id: `s${i}`,
        content: `c${i}`,
      })),
    ),
    visible,
    false,
  );

const SLIDABLE = layoutOf(12, 3);
const TOO_SHORT = layoutOf(2, 3);

const stateWith = (
  layout: CarouselLayout,
  motionPhase: CarouselState["motionPhase"] = "idle",
): CarouselState => ({ ...initialStateFor(layout), motionPhase });

interface Props {
  state?: CarouselState;
  isAutoplayOn?: boolean;
  isTouch?: boolean;
  isAtEnd?: boolean;
}

let host: HTMLDivElement;
let root: Root;
let moves: Array<[number, MoveReason]>;
let goTos: Array<[number, MoveReason]>;
let handleHoverChange: (hovering: boolean) => void;

const navigation = {
  move: (step: number, reason: MoveReason) => moves.push([step, reason]),
  goTo: (pageIndex: number, reason: MoveReason) =>
    goTos.push([pageIndex, reason]),
  handlePrev: () => {},
  handleNext: () => {},
  handlePageSelect: () => {},
  handleSlideClick: () => {},
} as CarouselNavigation;

function Probe({
  state = stateWith(SLIDABLE),
  isAutoplayOn = true,
  isTouch = false,
  isAtEnd = false,
}: Props) {
  const viewportRef = { current: host };
  const api = useCarouselAutoplay({
    state,
    config,
    navigation,
    isAutoplayOn,
    isTouch,
    isAtEnd,
    viewportRef,
  });
  handleHoverChange = api.handleHoverChange;
  return null;
}

const render = (props: Props = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const tick = () =>
  act(() => {
    vi.advanceTimersByTime(config.autoplayInterval);
  });

beforeEach(() => {
  vi.useFakeTimers();
  moves = [];
  goTos = [];
  // No IntersectionObserver: the guarded hook reports the deck as on screen,
  // which is the state autoplay is supposed to run in.
  vi.stubGlobal("IntersectionObserver", undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useCarouselAutoplay — when it runs", () => {
  it("steps one page forward, attributed to autoplay", () => {
    render();
    tick();
    expect(moves).toEqual([[1, "autoplay"]]);
  });

  it("loops home rather than stepping when the deck is at its end", () => {
    render({ isAtEnd: true });
    tick();
    expect(goTos).toEqual([[0, "autoplay"]]);
    expect(moves).toEqual([]);
  });
});

describe("useCarouselAutoplay — the gates", () => {
  it("stays off when the host has not asked for it", () => {
    render({ isAutoplayOn: false });
    tick();
    expect(moves).toEqual([]);
  });

  it("stays off on a deck with nowhere to go", () => {
    render({ state: stateWith(TOO_SHORT) });
    tick();
    expect(moves).toEqual([]);
  });

  it("holds while a finger is on the deck", () => {
    render({ state: stateWith(SLIDABLE, "dragging") });
    tick();
    expect(moves).toEqual([]);
  });

  it("holds during its own ride, so a step never lands on a step", () => {
    render({ state: stateWith(SLIDABLE, "step-normal") });
    tick();
    expect(moves).toEqual([]);
  });

  it("resumes once the ride settles", () => {
    render({ state: stateWith(SLIDABLE, "step-normal") });
    tick();
    expect(moves).toEqual([]);

    render({ state: stateWith(SLIDABLE, "idle") });
    tick();
    expect(moves).toEqual([[1, "autoplay"]]);
  });
});

describe("useCarouselAutoplay — hover", () => {
  it("pauses for a pointer that settles on the deck", () => {
    render({ isTouch: false });
    act(() => handleHoverChange(true));
    act(() => {
      vi.advanceTimersByTime(config.interaction.hoverPauseDelayMs);
    });
    tick();
    expect(moves).toEqual([]);
  });

  it("ignores hover on a touch deck, where there is no pointer to rest", () => {
    render({ isTouch: true });
    act(() => handleHoverChange(true));
    act(() => {
      vi.advanceTimersByTime(config.interaction.hoverPauseDelayMs);
    });
    tick();
    expect(moves).toEqual([[1, "autoplay"]]);
  });
});
