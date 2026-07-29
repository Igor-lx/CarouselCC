// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildCarouselLayout, buildSlideRecords } from "../../domain";
import type { CarouselLayout, CarouselSlideRecord, VirtualSlide } from "../../domain";
import type { Slide } from "../../public-api/types";
import { useSlideRenderModel } from "../useSlideRenderModel";

/**
 * Which slides exist, where their lanes are measured from, and whether their
 * objects survive a re-render.
 *
 * Two of these are invisible when broken. A window that shrinks mid-ride
 * unmounts a slide the eye can still see — a pop, only on a real device. And a
 * `VirtualSlide` rebuilt when nothing about it moved hands every memoised
 * `SlideItem` a fresh `ariaProps`, so the whole deck re-renders twice per ride,
 * in exactly the two frames it can least afford.
 */

const BUFFER = 4;

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
}

let host: HTMLDivElement;
let root: Root;
let seen: { virtualSlides: VirtualSlide[]; layoutOrigin: number };

function Probe(input: Input) {
  seen = useSlideRenderModel({
    ...input,
    layout,
    records,
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
});
