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

describe("resolveDragRelease вЂ” directionless release", () => {
  it("from rest: geometry decides вЂ” snap to the page nearest the release position", () => {
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
   * hold that expressed no direction settles onto the PRESSED page вЂ” the
   * slide in front of the eyes, the one the browser's long-press menu
   * describes вЂ” riding the normal step curve (isSnap false), like a button.
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
