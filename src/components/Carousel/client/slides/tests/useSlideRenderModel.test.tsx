// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type {
  CarouselLayout,
  CarouselSlideRecord,
  VirtualSlide,
} from "../../domain";
import type { Slide } from "../../public-api/types";
import { useSlideRenderModel } from "../useSlideRenderModel";

/**
 * Which slides exist, where their lanes are measured from, and whether their
 * objects survive a re-render.
 *
 * A window that shrinks mid-ride unmounts a slide the eye can still see — a
 * pop, only on a real device.
 *
 * The identity assertions below say the cache WORKS, which is not the same as
 * the deck being spared: measured, it prevents no re-render at all, because
 * `ariaProps` is spread at the call site. What that costs and what follows is
 * `slideRenderCost.test.tsx`, and item 4 of the deferred-work list.
 */

const BUFFER = 4;
const BAND = 512; // LAYOUT_ORIGIN_BAND_SLOTS

const recordsOf = (slideCount: number): CarouselSlideRecord[] =>
  buildSlideRecords(
    Array.from({ length: slideCount }, (_, i): Slide => ({
      id: `s${i}`,
      content: `slide ${i}`,
    })),
  );

const records = recordsOf(12);
const layout: CarouselLayout = buildCarouselLayout(records, 3, false);

interface Input {
  current: number;
  previous: number;
  isMoving: boolean;
  /** Swapped in by the identity tests: the deck's data can change under a
   *  window that did not move at all. */
  records?: CarouselSlideRecord[];
  layout?: CarouselLayout;
}

let host: HTMLDivElement;
let root: Root;
let seen: { virtualSlides: VirtualSlide[]; layoutOrigin: number };

function Probe({
  records: recordsOverride,
  layout: layoutOverride,
  ...input
}: Input) {
  seen = useSlideRenderModel({
    ...input,
    layout: layoutOverride ?? layout,
    records: recordsOverride ?? records,
    renderWindowBufferMultiplier: BUFFER,
  });
  return null;
}

const render = (input: Input) =>
  act(() => {
    root.render(<Probe {...input} />);
  });

const lanes = () => seen.virtualSlides.map((s) => s.virtualIndex);
const byIndex = (virtualIndex: number) =>
  seen.virtualSlides.find((s) => s.virtualIndex === virtualIndex);

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useSlideRenderModel — the mounted set", () => {
  it("mounts the visible band plus its buffer at rest", () => {
    render({ current: 0, previous: 0, isMoving: false });
    for (const lane of [0, 1, 2]) expect(lanes()).toContain(lane);
    expect(lanes().length).toBeGreaterThan(3);
  });

  it("mounts nothing at all for an empty deck", () => {
    // The early return is the only path that never touches the window, so
    // nothing downstream would notice it handing back a filled array — the
    // deck would render slides built from records that do not exist.
    const empty = recordsOf(0);
    render({
      current: 0,
      previous: 0,
      isMoving: false,
      records: empty,
      layout: buildCarouselLayout(empty, 3, false),
    });

    expect(seen.virtualSlides).toEqual([]);
  });

  it("keeps a slide mounted for the whole ride it appears in", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const atStart = lanes();

    // Mid-ride: the window must still hold everything it held at the origin.
    render({ current: 6, previous: 0, isMoving: true });
    for (const lane of atStart) {
      expect(lanes(), `lane ${lane} unmounted mid-ride`).toContain(lane);
    }
    // …and everything the destination needs.
    for (const lane of [6, 7, 8]) expect(lanes()).toContain(lane);
  });

  it("only ever grows while moving, however many retargets arrive", () => {
    render({ current: 0, previous: 0, isMoving: false });
    render({ current: 6, previous: 0, isMoving: true });
    const wide = lanes();

    // A retarget back towards the origin must not drop what is on screen.
    render({ current: 3, previous: 0, isMoving: true });
    for (const lane of wide) expect(lanes()).toContain(lane);
  });

  it("an ordinary ride needs no new slides — the buffer is sized for it", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const resting = lanes();

    // A one-page step already sits inside the resting buffer, so not a single
    // slide mounts mid-ride. That is what the buffer multiplier is FOR.
    render({ current: 3, previous: 0, isMoving: true });
    expect(lanes()).toEqual(resting);
  });

  it("grows for a jump the buffer cannot cover, then shrinks on settle", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const resting = lanes().length;

    render({ current: 30, previous: 0, isMoving: true });
    expect(lanes().length).toBeGreaterThan(resting);

    render({ current: 30, previous: 30, isMoving: false });
    expect(lanes().length).toBe(resting);
  });
});

describe("useSlideRenderModel — slide identity", () => {
  it("hands back the SAME object when nothing about a slide changed", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const before = byIndex(1);

    // The rebuild that happens twice per ride: isMoving flips, lanes do not.
    render({ current: 0, previous: 0, isMoving: true });
    expect(byIndex(1)).toBe(before);
    expect(byIndex(1)!.ariaProps).toBe(before!.ariaProps);
  });

  it("rebuilds only the slide whose band membership actually moved", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const stable = byIndex(8); // far outside the band, both before and after
    const leaving = byIndex(0);

    render({ current: 3, previous: 3, isMoving: false });
    expect(byIndex(8)).toBe(stable);
    expect(byIndex(0)).not.toBe(leaving); // it left the band, so its aria moved
  });

  it("labels each slide by its place in the DECK, not in the window", () => {
    render({ current: 0, previous: 0, isMoving: false });
    expect(byIndex(0)!.ariaProps["aria-label"]).toBe("1 of 12");
    expect(byIndex(11)!.ariaProps["aria-label"]).toBe("12 of 12");
  });

  it("gives a looped lane its own key so it never collides with the original", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const original = byIndex(1)!;
    const looped = byIndex(-11); // same slide, one loop back
    expect(looped).toBeDefined();
    expect(looped!.slideData).toBe(original.slideData);
    expect(looped!.slideKey).not.toBe(original.slideKey);
  });

  it("every mounted slide has a distinct key", () => {
    render({ current: 6, previous: 0, isMoving: true });
    const keys = seen.virtualSlides.map((s) => s.slideKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("useSlideRenderModel — the layout origin", () => {
  it("holds still while the window drifts inside its band", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const origin = seen.layoutOrigin;

    // A settle-time window shift must not re-base a single lane, or every
    // slide's --slide-lane changes and the compositor re-rasters the strip.
    render({ current: 3, previous: 3, isMoving: false });
    expect(seen.layoutOrigin).toBe(origin);
  });

  it("re-centres once the window has drifted a whole band away", () => {
    render({ current: 0, previous: 0, isMoving: false });
    const origin = seen.layoutOrigin;

    render({ current: 5000, previous: 5000, isMoving: false });
    expect(seen.layoutOrigin).not.toBe(origin);
  });

  it("re-centres in BOTH directions, not only forwards", () => {
    // The band is two-sided: a deck ridden backwards drifts below the origin
    // just as far. Watch only the far edge and the lane numbers grow without
    // bound going left, until the transform loses its precision.
    render({ current: 0, previous: 0, isMoving: false });
    const origin = seen.layoutOrigin;

    render({ current: -5000, previous: -5000, isMoving: false });
    expect(seen.layoutOrigin).not.toBe(origin);
    expect(seen.layoutOrigin).toBeLessThan(origin);
  });

  it("remembers where it re-centred, so the next shift is free again", () => {
    // Computing the new origin is half the job; committing it is the other
    // half. Drop the commit and the origin is recomputed from the window on
    // every render after a drift — which moves every slide's lane on every
    // settle, the exact re-raster the band exists to prevent. The first shift
    // after a re-centre is where that shows.
    render({ current: 0, previous: 0, isMoving: false });
    render({ current: 5000, previous: 5000, isMoving: false });
    const recentred = seen.layoutOrigin;

    render({ current: 5003, previous: 5003, isMoving: false });

    expect(seen.layoutOrigin).toBe(recentred);
  });

  it("holds at the band's LOWER edge too, not only its upper one", () => {
    // The band is two-sided and its two edges are two separate comparisons.
    // The upper one is walked below; this one is its mirror, and without it a
    // deck ridden backwards re-bases a lane early — invisible in every test
    // that only ever moves forwards.
    render({ current: 0, previous: 0, isMoving: false });
    const origin = seen.layoutOrigin;
    const near = () => Math.min(...lanes());

    let current = origin;
    let steppedOut = false;
    while (!steppedOut && current > origin - BAND - 32) {
      current -= 1;
      render({ current, previous: current, isMoving: false });
      steppedOut = near() < origin - BAND;
      if (!steppedOut) expect(seen.layoutOrigin).toBe(origin);
    }

    expect(steppedOut).toBe(true);
    expect(near()).toBe(origin - BAND - 1);
    expect(seen.layoutOrigin).not.toBe(origin);
  });

  it("holds AT the band edge and lets go one lane past it", () => {
    // The edge is where "inside the band" and "past it" stop agreeing, and it
    // is the only place the comparison is specified. A window that reaches the
    // edge exactly must still cost nothing.
    render({ current: 0, previous: 0, isMoving: false });
    const origin = seen.layoutOrigin;
    const far = () => Math.max(...lanes());

    // Walk the window outwards one lane at a time. The window's shape is not
    // predicted — it is read back each step — so the assertion is exactly the
    // rule: the origin holds for as long as the far lane is inside the band,
    // and moves on the first lane that is not.
    let current = origin;
    let steppedOut = false;
    while (!steppedOut && current < origin + BAND + 32) {
      current += 1;
      render({ current, previous: current, isMoving: false });
      steppedOut = far() > origin + BAND;
      if (!steppedOut) expect(seen.layoutOrigin).toBe(origin);
    }

    expect(steppedOut).toBe(true);
    expect(far()).toBe(origin + BAND + 1);
    expect(seen.layoutOrigin).not.toBe(origin);
  });
});

describe("useSlideRenderModel — which lanes are loop clones", () => {
  it("clones only the lanes that fall outside the deck", () => {
    // A clone key exists to stop a looped lane colliding with the original.
    // Handing one to an in-range lane duplicates keys the other way round.
    render({ current: 0, previous: 0, isMoving: false });

    expect(byIndex(-1)!.slideKey).toContain("clone:");
    expect(byIndex(0)!.slideKey).not.toContain("clone:");
    expect(byIndex(11)!.slideKey).not.toContain("clone:");
    expect(byIndex(12)!.slideKey).toContain("clone:");
  });

  it("clones nothing at all on a finite deck", () => {
    // Without looping there is no second copy to collide with, and a lane
    // outside the deck is simply not rendered.
    const finite = buildCarouselLayout(records, 3, true);
    render({ current: 0, previous: 0, isMoving: false, layout: finite });

    for (const slide of seen.virtualSlides) {
      expect(slide.slideKey).not.toContain("clone:");
    }
  });
});

/**
 * The identity cache carries two `eslint-disable`s and a CONSTRAINT saying why
 * the rule is worth breaking here. The run asked the fair question back: is
 * that benefit held by a test, or only by the comment? Three of the four
 * fields the cache compares had no test at all — meaning the cache could have
 * started handing back a STALE object and every suite would have stayed green,
 * which is worse than not caching at all.
 */
describe("useSlideRenderModel — what forces a slide object to be rebuilt", () => {
  it("rebuilds when the band membership changes but actuality does not", () => {
    // Slide 0 is outside the destination band in both renders — `isActual` is
    // false either way — yet it is on screen in the first (it was where the
    // ride started) and gone in the second. Reuse the object and the slide
    // keeps `inert` off after it has left, catching focus and taps.
    render({ current: 3, previous: 0, isMoving: true });
    const onScreen = byIndex(0)!;
    expect(onScreen.isActual).toBe(false);
    expect(onScreen.isActive).toBe(true);

    render({ current: 3, previous: 6, isMoving: true });
    const offScreen = byIndex(0)!;

    expect(offScreen.isActual).toBe(false);
    expect(offScreen.isActive).toBe(false);
    expect(offScreen).not.toBe(onScreen);
  });

  it("rebuilds when the slide's own data is replaced under it", () => {
    // The host can swap a slide's content without the window moving: same id,
    // same lane, new picture. A cache that only watches the flags would hand
    // React the previous object and the deck would keep showing the old one.
    render({ current: 0, previous: 0, isMoving: false });
    const before = byIndex(1)!;
    expect(before.slideData.content).toBe("slide 1");

    const swapped = buildSlideRecords(
      Array.from({ length: 12 }, (_, i): Slide => ({
        id: `s${i}`,
        content: i === 1 ? "replaced" : `slide ${i}`,
      })),
    );
    render({ current: 0, previous: 0, isMoving: false, records: swapped });

    expect(byIndex(1)).not.toBe(before);
    expect(byIndex(1)!.slideData.content).toBe("replaced");
    // …and the slides that did NOT change are still the same objects, or the
    // cache would be doing nothing at all.
    expect(byIndex(2)!.slideData.content).toBe("slide 2");
  });

  // The fourth field the cache compares, `slideKey`, has no test of its own on
  // purpose: it can only differ for an out-of-band lane (`clone:` prefix), and
  // those lanes exist only while the deck loops. Flip that and the lane itself
  // stops being rendered, so there is no cached object left to hand back — the
  // comparison cannot be falsified through anything a consumer can observe.

  it("keeps reusing objects across repeated rebuilds, not just the first", () => {
    // Bounded memory evicts what left the window — but only what left it.
    // Evicting live entries would make the cache miss every time, which the
    // single-rebuild test above cannot tell apart from a hit.
    render({ current: 0, previous: 0, isMoving: false });
    render({ current: 0, previous: 0, isMoving: true });
    const second = byIndex(1);

    render({ current: 0, previous: 0, isMoving: false });
    expect(byIndex(1)).toBe(second);

    render({ current: 0, previous: 0, isMoving: true });
    expect(byIndex(1)).toBe(second);
  });
});
