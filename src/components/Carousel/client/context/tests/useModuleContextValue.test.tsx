// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import { buildInitialState } from "../../state/initial";
import type { CarouselState } from "../../state";
import type { CarouselNavigation } from "../../navigation";
import type { Slide } from "../../public-api/types";
import { useModuleContextValue } from "../useModuleContextValue";
import type {
  CarouselMotionContextValue,
  CarouselStableContextValue,
} from "../types";

/**
 * The context is split in two ON PURPOSE: a STABLE half that modules may put
 * in dependency arrays, and a MOTION half that re-identifies every transition.
 *
 * The split only pays if the stable half really is stable. Let one
 * high-frequency field leak into it — or drop a `useMemo` — and every module
 * subscribed to it re-renders on every transition, which is the cost the split
 * exists to remove. Nothing looks wrong; the deck just gets slower, in the
 * frames it can least afford.
 */

const layout = buildCarouselLayout(
  buildSlideRecords(
    Array.from({ length: 12 }, (_, i): Slide => ({
      id: `s${i}`,
      content: `c${i}`,
    })),
  ),
  3,
  false,
);

const trackRef = createRef<HTMLDivElement>();
const slides = Object.freeze([]);

const navigation = {
  move: () => {},
  goTo: () => {},
  handlePrev: () => {},
  handleNext: () => {},
  handlePageSelect: () => {},
  handleSlideClick: () => {},
} as CarouselNavigation;

interface Props {
  state?: CarouselState;
  isAtEnd?: boolean;
  isOffBandFetchOn?: boolean;
}

let host: HTMLDivElement;
let root: Root;
let stable: CarouselStableContextValue;
let motion: CarouselMotionContextValue;

const base = buildInitialState(layout);

function Probe({
  state = base,
  isAtEnd = false,
  isOffBandFetchOn = true,
}: Props) {
  const value = useModuleContextValue({
    state,
    navigation,
    isTouch: false,
    isReducedMotion: false,
    isDataSaverEnabled: false,
    slides,
    trackRef,
    isOffBandFetchOn,
    visualPosition: null,
    motionPlan: null,
    isAtStart: false,
    isAtEnd,
    isDiagnosticActive: false,
    isPaginationInteractiveOn: true,
  });
  stable = value.stable;
  motion = value.motion;
  return null;
}

const render = (props: Props = {}) =>
  act(() => {
    root.render(<Probe {...props} />);
  });

const moving = (overrides: Partial<CarouselState> = {}): CarouselState => ({
  ...base,
  motionPhase: "step-normal",
  virtualIndex: 3,
  targetPageIndex: 1,
  ...overrides,
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useModuleContextValue — the stable half", () => {
  it("survives a plain re-render", () => {
    render();
    const before = stable;
    render();
    expect(stable).toBe(before);
  });

  it("survives a MOTION transition — the whole reason for the split", () => {
    render();
    const stableBefore = stable;
    const motionBefore = motion;

    render({ state: moving() });
    expect(motion).not.toBe(motionBefore); // the motion half really did move…
    expect(stable).toBe(stableBefore); // …and the stable half did not follow it
  });

  it("survives the deck settling again", () => {
    render({ state: moving() });
    const before = stable;
    render({ state: { ...moving(), motionPhase: "idle" } });
    expect(stable).toBe(before);
  });

  it("DOES re-identify when something in it genuinely changes", () => {
    render({ isAtEnd: false });
    const before = stable;
    render({ isAtEnd: true });
    expect(stable).not.toBe(before);
    expect(stable.layout.isAtEnd).toBe(true);
  });

  it("re-identifies when the bandwidth gate opens", () => {
    render({ isOffBandFetchOn: false });
    const before = stable;
    render({ isOffBandFetchOn: true });
    expect(stable).not.toBe(before);
  });
});

describe("useModuleContextValue — the motion half", () => {
  it("re-identifies when the phase changes", () => {
    render();
    const before = motion;
    render({ state: moving() });
    expect(motion).not.toBe(before);
    expect(motion.status.isMoving).toBe(true);
  });

  it("re-identifies when the destination changes", () => {
    render({ state: moving({ targetPageIndex: 1 }) });
    const before = motion;
    render({ state: moving({ targetPageIndex: 2 }) });
    expect(motion).not.toBe(before);
    expect(motion.intent.targetPageIndex).toBe(2);
  });

  it("holds still when neither phase nor destination moved", () => {
    render({ state: moving() });
    const before = motion;
    render({ state: moving() });
    expect(motion).toBe(before);
  });

  it("reports a phase that agrees with itself", () => {
    render({ state: moving({ motionPhase: "dragging" }) });
    expect(motion.status).toMatchObject({
      isDragging: true,
      isIdle: false,
      isMoving: false,
    });
  });
});
