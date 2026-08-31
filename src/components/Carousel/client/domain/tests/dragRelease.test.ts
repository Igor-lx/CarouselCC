import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from "..";
import type { Slide } from "../../public-api/types";
import { resolveDragRelease } from "../dragRelease";

const makeLayout = (slideCount = 12, visible = 1) => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `s-${i}`,
    content: `slide-${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visible, false);
};

describe("resolveDragRelease — directionless release", () => {
  it("from rest: geometry decides — snap to the page nearest the release position", () => {
    const layout = makeLayout();
    const early = resolveDragRelease({
      direction: "none",
      releasePosition: 0.2,
      dragOriginPageIndex: 0,
      isInFlightGrab: false,
      pressedPageIndex: null,
      layout,
    });
    expect(early.targetPageIndex).toBe(0);
    expect(early.isSnap).toBe(true);

    const far = resolveDragRelease({
      direction: "none",
      releasePosition: 0.7,
      dragOriginPageIndex: 0,
      isInFlightGrab: false,
      pressedPageIndex: null,
      layout,
    });
    expect(far.targetPageIndex).toBe(1);
  });

  /**
   * The catch-and-hold contract: pressing a moving strip brakes it, and a
   * hold that expressed no direction settles onto the PRESSED page — the
   * slide in front of the eyes, the one the browser's long-press menu
   * describes — riding the normal step curve (isSnap false), like a button.
   *
   * The geometry judgment this replaces threw a barely-started ride away:
   * grabbed at 30%, "nearest page" returned the strip to the origin and the
   * slide that was entering retreated right under the user's finger, while
   * the long-press menu kept describing it.
   */
  it("in-flight grab: a directionless release settles onto the PRESSED page", () => {
    const layout = makeLayout();
    // Ride 0 -> 1 grabbed early; the finger landed on the still-dominant
    // outgoing slide (page 0): the strip stays with what was pressed.
    const onOutgoing = resolveDragRelease({
      direction: "none",
      releasePosition: 0.3,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
      pressedPageIndex: 0,
      layout,
    });
    expect(onOutgoing.targetPageIndex).toBe(0);
    expect(onOutgoing.isSnap).toBe(false); // normal step curve, not the quick snap

    // Same grab, finger on the ENTERING slide's sliver: it finishes arriving.
    const onEntering = resolveDragRelease({
      direction: "none",
      releasePosition: 0.3,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
      pressedPageIndex: 1,
      layout,
    });
    expect(onEntering.targetPageIndex).toBe(1);
    expect(onEntering.isSnap).toBe(false);
  });

  it("in-flight grab with no press measurement falls back to the ride's destination", () => {
    const layout = makeLayout();
    const release = resolveDragRelease({
      direction: "none",
      releasePosition: 0.3,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
      pressedPageIndex: null,
      layout,
    });
    expect(release.targetPageIndex).toBe(1);
    expect(release.isSnap).toBe(false);
  });

  it("in-flight grab: an explicit counter-swipe still redirects", () => {
    const layout = makeLayout();
    // Anchored at destination 1; a committed swipe back goes to 0.
    const release = resolveDragRelease({
      direction: "right",
      releasePosition: 0.4,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
      pressedPageIndex: 0,
      layout,
    });
    expect(release.targetPageIndex).toBe(0);
    expect(release.isSnap).toBe(false);
  });

  it("a committed swipe forward advances from the anchor regardless of grab kind", () => {
    const layout = makeLayout();
    const release = resolveDragRelease({
      direction: "left",
      releasePosition: 1.6,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
      pressedPageIndex: 1,
      layout,
    });
    expect(release.targetPageIndex).toBe(2);
    expect(release.isSnap).toBe(false);
  });
});

/**
 * A finite deck is where the direction and the edge meet: the swipe asks for
 * the next page, the clamp refuses at the last one, and `isSnap` is what tells
 * the runner "this is a rubber-band back, not a navigation". None of that was
 * exercised — the whole finite branch of the release had no test reaching it.
 */
describe("resolveDragRelease — a committed swipe on a finite deck", () => {
  const finite = (slideCount = 12, visible = 3) =>
    buildCarouselLayout(
      buildSlideRecords(
        Array.from({ length: slideCount }, (_, i) => ({
          id: `s-${i}`,
          content: `slide-${i}`,
        })),
      ),
      visible,
      true,
    );

  const release = (
    direction: "left" | "right",
    dragOriginPageIndex: number,
    layout = finite(),
  ) =>
    resolveDragRelease({
      direction,
      releasePosition: dragOriginPageIndex * layout.visibleSlidesCount,
      dragOriginPageIndex,
      isInFlightGrab: false,
      pressedPageIndex: null,
      layout,
    });

  it("swiping forward advances exactly one page", () => {
    const r = release("left", 1);
    expect(r.targetPageIndex).toBe(2);
    expect(r.targetVirtualIndex).toBe(6);
    expect(r.isSnap).toBe(false);
  });

  it("swiping back retreats exactly one page", () => {
    const r = release("right", 2);
    expect(r.targetPageIndex).toBe(1);
    expect(r.targetVirtualIndex).toBe(3);
    expect(r.isSnap).toBe(false);
  });

  it("swiping forward off the last page snaps back to it", () => {
    // The clamp refuses, the target equals the origin, and that equality is
    // what makes it a snap: the runner must rubber-band rather than animate a
    // navigation to where the deck already is.
    const r = release("left", 3);
    expect(r.targetPageIndex).toBe(3);
    expect(r.isSnap).toBe(true);
  });

  it("swiping back off the first page snaps back to it", () => {
    const r = release("right", 0);
    expect(r.targetPageIndex).toBe(0);
    expect(r.isSnap).toBe(true);
  });
});

describe("resolveDragRelease — a committed swipe on a cyclic deck", () => {
  it("wraps backwards past the first page instead of snapping", () => {
    const layout = makeLayout(12, 3);
    const r = resolveDragRelease({
      direction: "right",
      releasePosition: 0,
      dragOriginPageIndex: 0,
      isInFlightGrab: false,
      pressedPageIndex: null,
      layout,
    });
    expect(r.targetPageIndex).toBe(3);
    expect(r.isSnap).toBe(false);
  });
});
