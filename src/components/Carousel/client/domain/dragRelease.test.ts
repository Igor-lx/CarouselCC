import { describe, expect, it } from "vitest";

import { buildCarouselLayout, buildSlideRecords } from ".";
import type { Slide } from "../public-api/types";
import { resolveDragRelease } from "./dragRelease";

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
      layout,
    });
    expect(early.targetPageIndex).toBe(0);
    expect(early.isSnap).toBe(true);

    const far = resolveDragRelease({
      direction: "none",
      releasePosition: 0.7,
      dragOriginPageIndex: 0,
      isInFlightGrab: false,
      layout,
    });
    expect(far.targetPageIndex).toBe(1);
  });

  /**
   * The defect this guards against: a ride N -> N+1 grabbed at 30% sits 0.7
   * slots behind its destination — because the RIDE put it there, not the
   * finger. Judging that position by geometry ("nearest page") threw the
   * committed navigation away: the strip returned to N and the slide that was
   * entering retreated off-screen, right under the user's finger. A grab that
   * expressed no direction of its own must let the interrupted ride finish.
   */
  it("in-flight grab: the interrupted ride's destination stays the target, even at 30%", () => {
    const layout = makeLayout();
    const release = resolveDragRelease({
      direction: "none",
      releasePosition: 0.3, // ride 0 -> 1, grabbed early: nearest would be 0
      dragOriginPageIndex: 1, // the in-flight anchor IS the destination
      isInFlightGrab: true,
      layout,
    });
    expect(release.targetPageIndex).toBe(1);
    expect(release.isSnap).toBe(true);
  });

  it("in-flight grab: an explicit counter-swipe still redirects", () => {
    const layout = makeLayout();
    // Anchored at destination 1; a committed swipe back goes to 0.
    const release = resolveDragRelease({
      direction: "right",
      releasePosition: 0.4,
      dragOriginPageIndex: 1,
      isInFlightGrab: true,
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
      layout,
    });
    expect(release.targetPageIndex).toBe(2);
    expect(release.isSnap).toBe(false);
  });
});
