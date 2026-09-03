// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, memo, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type {
  CarouselLayout,
  SlideAriaProps,
  VirtualSlide,
} from "../../domain";
import type { Slide } from "../../public-api/types";
import { useSlideRenderModel } from "../useSlideRenderModel";

/**
 * What a dispatch actually COSTS the deck, counted in renders.
 *
 * The identity cache in `useSlideRenderModel` carries two `eslint-disable`s and
 * a CONSTRAINT claiming that without it "the whole deck re-renders in the two
 * frames a ride starts and settles in". That is a statement about renders, and
 * every test around it asserted object identity instead — which is the cache
 * working, not the deck being spared.
 *
 * So this file counts the thing the claim is about. The probe mirrors the real
 * call site in `Carousel.tsx` field for field, because the whole question turns
 * on HOW the payload is handed over: `ariaProps` is SPREAD there, so what
 * reaches the memo boundary is four primitives, not one object. Pass it as an
 * object here and the measurement would answer a question nobody asks.
 */

const BUFFER = 4;

const records = buildSlideRecords(
  Array.from({ length: 12 }, (_, i): Slide => ({
    id: `s${i}`,
    content: `slide ${i}`,
  })),
);
const layout: CarouselLayout = buildCarouselLayout(records, 3, false);

/** Elements built by `map` on the latest render. Every parent render
 * allocates them, cache or not — the denominator the saving is measured
 * against. */
let elementsBuilt: number;

/** The slide objects of the latest render — read back to count rebuilds. */
let seenSlides: VirtualSlide[];

/** Renders per virtual index, across the whole scenario. */
let renders: Map<number, number>;

const countRender = (virtualIndex: number) => {
  renders.set(virtualIndex, (renders.get(virtualIndex) ?? 0) + 1);
};

interface SlideProbeProps extends SlideAriaProps {
  virtualIndex: number;
  slideData: Slide;
  style: { transform: string };
  isActive: boolean;
  isActual: boolean;
  isFetchOn: boolean;
  isInteractiveOn: boolean;
  onSlideClick: (slide: Slide) => void;
}

/** Stands in for `memo(SlideItem)`: a plain memo, no custom comparator —
 * exactly what the real one is. */
const SlideProbe = memo(function SlideProbe({ virtualIndex }: SlideProbeProps) {
  countRender(virtualIndex);
  return null;
});

// Stable across renders, the way the real call site's are: the lane style comes
// from `laneCacheRef` (keyed `origin:index`) in presentation, and the click
// handler from `useCarouselNavigation`'s memo.
const laneStyles = new Map<number, { transform: string }>();
const laneStyleFor = (virtualIndex: number) => {
  const cached = laneStyles.get(virtualIndex);
  if (cached) return cached;
  const style = { transform: `translate3d(${virtualIndex * 100}px,0,0)` };
  laneStyles.set(virtualIndex, style);
  return style;
};
const onSlideClick = () => {};

interface RideStep {
  current: number;
  previous: number;
  isMoving: boolean;
}

function Deck({ current, previous, isMoving }: RideStep) {
  const { virtualSlides } = useSlideRenderModel({
    current,
    previous,
    isMoving,
    layout,
    records,
    renderWindowBufferMultiplier: BUFFER,
  });

  seenSlides = virtualSlides;

  // Mirrors `Carousel.tsx`: every prop derived from the slide is a primitive,
  // a value whose identity comes from elsewhere, or a spread.
  const isInteractiveOn = useMemo(() => true, []);

  return (
    <>
      {virtualSlides.map((slide) => {
        // Every parent render rebuilds this element and its props object,
        // cache or no cache — the denominator the saving is measured against.
        elementsBuilt += 1;
        return (
          <SlideProbe
            key={slide.slideKey}
            virtualIndex={slide.virtualIndex}
            slideData={slide.slideData}
            style={laneStyleFor(slide.virtualIndex)}
            isActive={slide.isActive}
            isActual={slide.isActual}
            isFetchOn={slide.isActive}
            isInteractiveOn={isInteractiveOn}
            onSlideClick={onSlideClick}
            {...slide.ariaProps}
          />
        );
      })}
    </>
  );
}

let host: HTMLDivElement;
let root: Root;

const render = (step: RideStep) =>
  act(() => {
    root.render(<Deck {...step} />);
  });

/** Renders caused by one step, per lane — the previous tally subtracted. */
const stepCost = (before: Map<number, number>): Map<number, number> => {
  const delta = new Map<number, number>();
  for (const [lane, count] of renders) {
    const moved = count - (before.get(lane) ?? 0);
    if (moved > 0) delta.set(lane, moved);
  }
  return delta;
};

const snapshot = () => new Map(renders);

beforeEach(() => {
  renders = new Map();
  elementsBuilt = 0;
  laneStyles.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the deck's render cost across a ride", () => {
  it("re-renders only the slides whose own flags moved, not the deck", () => {
    // The two frames the CONSTRAINT calls expensive: `isMoving` flips on at the
    // start of a ride and off at its settle, and `virtualSlides` is rebuilt
    // both times. What must NOT follow is the whole deck re-rendering — only
    // the slides whose visibility flags actually changed.
    render({ current: 0, previous: 0, isMoving: false });
    const mounted = renders.size;
    expect(mounted).toBeGreaterThan(3);

    const atRest = snapshot();
    render({ current: 0, previous: 0, isMoving: true }); // ride starts
    const onStart = stepCost(atRest);

    const midRide = snapshot();
    render({ current: 0, previous: 0, isMoving: false }); // ride settles
    const onSettle = stepCost(midRide);

    // Neither frame may touch every mounted slide.
    expect(onStart.size).toBeLessThan(mounted);
    expect(onSettle.size).toBeLessThan(mounted);
  });

  it("costs nothing at all when the flip changes no slide's flags", () => {
    // Standing still at an integer position, `isMoving` alone changes nothing
    // any slide can see: the band is the same before and after. The exact
    // number is the point — "fewer than all" would pass on a deck that
    // re-renders all but one.
    render({ current: 0, previous: 0, isMoving: false });

    const atRest = snapshot();
    render({ current: 0, previous: 0, isMoving: true });

    expect([...stepCost(atRest).keys()]).toEqual([]);
  });

  it("re-renders a slide the moment its own band membership moves", () => {
    // The other direction, so the test above cannot pass by the deck being
    // frozen: a step that moves the band DOES cost the slides it moves.
    render({ current: 0, previous: 0, isMoving: false });

    const atRest = snapshot();
    render({ current: 3, previous: 3, isMoving: false });
    const cost = stepCost(atRest);

    expect(cost.size).toBeGreaterThan(0);
    // Slide 0 left the band, slide 3 entered it — both must have been redrawn.
    expect(cost.has(0)).toBe(true);
    expect(cost.has(3)).toBe(true);
  });
});

/**
 * The other half of the cost, and the only one the cache actually pays for:
 * ALLOCATIONS. Counted as objects, not bytes — a heap measurement under jsdom
 * would be reporting the garbage collector's mood, while "how many objects did
 * this dispatch create" is deterministic and observable from outside, by
 * identity alone.
 *
 * The unit is one rebuilt `VirtualSlide`, because each one costs exactly three
 * allocations: the slide object, its `ariaProps` object, and the `aria-label`
 * template string — all three inside a single literal in the hook.
 *
 * These assertions carry the numbers on purpose. Remove the cache and they
 * fail with both figures in the message, which is the measurement.
 */
describe("the deck's allocation cost across a ride", () => {
  /** Slides handed back as a NEW object since the previous render. */
  const rebuilt = (before: Map<number, object>) => {
    const now = new Map(seenSlides.map((s) => [s.virtualIndex, s as object]));
    let count = 0;
    for (const [index, object] of now) {
      if (before.get(index) !== object) count += 1;
    }
    return count;
  };
  const objects = () =>
    new Map(seenSlides.map((s) => [s.virtualIndex, s as object]));

  it("allocates nothing when a ride starts and settles in place", () => {
    // The two frames the old CONSTRAINT called expensive. Standing at an
    // integer position, `isMoving` alone moves no slide's flags, so with the
    // cache not one object is rebuilt — and without it, every mounted slide is.
    render({ current: 0, previous: 0, isMoving: false });
    const mounted = seenSlides.length;
    expect(mounted).toBe(27);

    const atRest = objects();
    render({ current: 0, previous: 0, isMoving: true });
    expect(rebuilt(atRest)).toBe(0);

    const midRide = objects();
    render({ current: 0, previous: 0, isMoving: false });
    expect(rebuilt(midRide)).toBe(0);
  });

  it("allocates only for the slides a step actually moves", () => {
    // A one-page step inside the resting buffer: the window does not move, so
    // the only rebuilds are the slides entering and leaving the visible band.
    render({ current: 0, previous: 0, isMoving: false });
    const atRest = objects();

    render({ current: 3, previous: 3, isMoving: false });

    expect(rebuilt(atRest)).toBe(9);
    expect(seenSlides.length).toBe(27);
  });
});

describe("what a dispatch allocates no matter what", () => {
  it("builds one element per mounted slide, once — mount included", () => {
    // The denominator. `virtualSlides.map(...)` runs on every parent render, so
    // an element and its props object are allocated whether or not the slide
    // object inside was reused. Any saving the identity cache makes is measured
    // against this, not against zero.
    //
    // Mount costing the SAME as a dispatch is the part worth pinning. It used
    // to cost twice: `committedOrigin` started at `null`, and the render-phase
    // write that forced ran the whole deck a second time before the first
    // paint. Seeding it from the mount's own window removed that pass.
    // Counted against the mounted set rather than a literal: the deck's size
    // is a tuning question (slides, visible count, buffer), and a test that
    // hard-codes it goes red on a knob turn while saying nothing about renders.
    render({ current: 0, previous: 0, isMoving: false });
    expect(elementsBuilt).toBe(seenSlides.length);

    elementsBuilt = 0;
    render({ current: 0, previous: 0, isMoving: true });

    expect(elementsBuilt).toBe(seenSlides.length);
  });
});
