import { describe, expect, it } from "vitest";

import { buildRawCarouselConfig } from "../config";
import type { CarouselRuntimeConfig } from "../config";
import { buildCarouselLayout, buildSlideRecords } from "../domain";
import type { CarouselLayout } from "../domain";
import type { Slide } from "../types";
import { buildInitialState } from "./initial";
import { carouselReducer } from "./reducer";
import type { CarouselCommand, CarouselState } from "./types";

// --- test kit ---------------------------------------------------------------

const config: CarouselRuntimeConfig = buildRawCarouselConfig({});

const makeLayout = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
  idTag = "a",
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `${idTag}-${i}`,
    content: `slide-${idTag}-${i}`,
  }));
  return buildCarouselLayout(buildSlideRecords(slides), visibleSlidesCount, isFinite);
};

/** Dispatch one command through the reducer with an explicit context. */
const reduce = (
  state: CarouselState,
  command: CarouselCommand,
  layout: CarouselLayout = state.layout,
  isInstantMode = false,
): CarouselState =>
  carouselReducer(state, { ...command, context: { layout, config, isInstantMode } });

// --- tests ------------------------------------------------------------------

describe("buildInitialState", () => {
  it("starts on page 0, idle, with no move reason", () => {
    const state = buildInitialState(makeLayout(12, 3, false));
    expect(state.targetPageIndex).toBe(0);
    expect(state.virtualIndex).toBe(0);
    expect(state.motionPhase).toBe("idle");
    expect(state.moveReason).toBeNull();
    expect(state.teleportVirtualIndex).toBeNull();
  });
});
describe("MOVE — cyclic", () => {
  const layout = makeLayout(12, 3, false); // pageCount 4

  it("advances one page on MOVE(+1)", () => {
    const next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(1);
    expect(next.virtualIndex).toBe(3);
    expect(next.motionPhase).toBe("step-normal");
    expect(next.moveReason).toBe("click");
  });

  it("wraps backwards on MOVE(-1) from page 0", () => {
    const next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(3);
    expect(next.virtualIndex).toBe(-3);
  });

  it("marks an autoplay step with the autoplay reason", () => {
    const next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "autoplay",
      fromVirtualIndex: 0,
    });
    expect(next.moveReason).toBe("autoplay");
  });
});
describe("MOVE — finite", () => {
  const layout = makeLayout(12, 3, true); // pageCount 4, finite

  it("clamps and no-ops at the start boundary", () => {
    const next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(0);
    expect(next.motionPhase).toBe("idle");
  });

  it("clamps at the end boundary", () => {
    const atEnd: CarouselState = {
      ...buildInitialState(layout),
      targetPageIndex: 3,
      virtualIndex: 9,
    };
    const next = reduce(atEnd, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 9,
    });
    expect(next.targetPageIndex).toBe(3);
    expect(next.motionPhase).toBe("idle");
  });
});

describe("GO_TO", () => {
  it("jumps directly for a short span (no teleport)", () => {
    const layout = makeLayout(12, 3, false); // pageCount 4
    const next = reduce(buildInitialState(layout), {
      type: "GO_TO",
      targetPageIndex: 2,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(2);
    expect(next.virtualIndex).toBe(6);
    expect(next.teleportVirtualIndex).toBeNull();
    expect(next.motionPhase).toBe("step-jump");
  });

  it("splits a far span into a bounded preflight + pending teleport", () => {
    const layout = makeLayout(30, 3, false); // pageCount 10
    const next = reduce(buildInitialState(layout), {
      type: "GO_TO",
      targetPageIndex: 5,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(5);
    // preflight is bounded; the final target is parked in teleportVirtualIndex.
    expect(next.virtualIndex).toBe(6); // preflight = 2 pages * stepSize 3
    expect(next.teleportVirtualIndex).toBe(15); // final = 5 pages * stepSize 3
    expect(next.motionPhase).toBe("step-jump");
  });
});

describe("MOTION_SETTLED", () => {
  const layout = makeLayout(30, 3, false);

  it("is a no-op while idle", () => {
    const idle = buildInitialState(layout);
    expect(reduce(idle, { type: "MOTION_SETTLED", settledPosition: 0 })).toBe(idle);
  });

  it("settles a normal step into idle", () => {
    const moving = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    const settled = reduce(moving, {
      type: "MOTION_SETTLED",
      settledPosition: moving.virtualIndex,
    });
    expect(settled.motionPhase).toBe("idle");
    expect(settled.virtualIndex).toBe(moving.virtualIndex);
  });

  it("teleports across the middle after a far-GO_TO preflight settles", () => {
    const preflight = reduce(buildInitialState(layout), {
      type: "GO_TO",
      targetPageIndex: 5,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    const approach = reduce(preflight, {
      type: "MOTION_SETTLED",
      settledPosition: preflight.virtualIndex,
    });
    expect(approach.teleportVirtualIndex).toBeNull();
    expect(approach.isTeleportApproach).toBe(true);
    expect(approach.virtualIndex).toBe(15); // final target
    expect(approach.fromVirtualIndex).toBe(12); // one approach page (stepSize 3) before it
    expect(approach.motionPhase).toBe("step-jump");
  });

  it("settles the post-teleport approach into idle", () => {
    const preflight = reduce(buildInitialState(layout), {
      type: "GO_TO",
      targetPageIndex: 5,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    const approach = reduce(preflight, {
      type: "MOTION_SETTLED",
      settledPosition: preflight.virtualIndex,
    });
    const done = reduce(approach, {
      type: "MOTION_SETTLED",
      settledPosition: approach.virtualIndex,
    });
    expect(done.motionPhase).toBe("idle");
    expect(done.isTeleportApproach).toBe(false);
    expect(done.virtualIndex).toBe(15);
  });

  it("re-anchors instead of stopping when a newer target replaced the old one", () => {
    const moving = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    // settle of an OLDER segment that finished at a different position.
    const reanchored = reduce(moving, {
      type: "MOTION_SETTLED",
      settledPosition: moving.virtualIndex - 3,
    });
    expect(reanchored.motionPhase).toBe(moving.motionPhase); // still moving
    expect(reanchored.fromVirtualIndex).toBe(moving.virtualIndex - 3);
  });
});

describe("START_DRAG / END_DRAG", () => {
  const layout = makeLayout(12, 3, false);

  it("enters the dragging phase on START_DRAG", () => {
    const next = reduce(buildInitialState(layout), {
      type: "START_DRAG",
      fromVirtualIndex: 3,
      targetPageIndex: 1,
    });
    expect(next.motionPhase).toBe("dragging");
    expect(next.moveReason).toBe("gesture");
    expect(next.targetPageIndex).toBe(1);
    expect(next.virtualIndex).toBe(3);
  });

  it("resolves a committed drag into a normal step", () => {
    const dragging = reduce(buildInitialState(layout), {
      type: "START_DRAG",
      fromVirtualIndex: 0,
      targetPageIndex: 0,
    });
    const released = reduce(dragging, {
      type: "END_DRAG",
      fromVirtualIndex: 5,
      targetPageIndex: 1,
      targetVirtualIndex: 3,
      isSnap: false,
      pointerReleaseVelocity: 0.1,
      uiReleaseVelocity: 0.12,
    });
    expect(released.motionPhase).toBe("step-normal");
    expect(released.targetPageIndex).toBe(1);
    expect(released.virtualIndex).toBe(3);
    expect(released.gesture.uiVelocity).toBe(0.12);
  });

  it("resolves a no-intent release into a snap-back", () => {
    const dragging = reduce(buildInitialState(layout), {
      type: "START_DRAG",
      fromVirtualIndex: 0,
      targetPageIndex: 0,
    });
    const released = reduce(dragging, {
      type: "END_DRAG",
      fromVirtualIndex: 1,
      targetPageIndex: 0,
      targetVirtualIndex: 0,
      isSnap: true,
      pointerReleaseVelocity: 0,
      uiReleaseVelocity: 0,
    });
    expect(released.motionPhase).toBe("step-snap");
  });

  it("settles instantly when the release is already on target", () => {
    const dragging = reduce(buildInitialState(layout), {
      type: "START_DRAG",
      fromVirtualIndex: 3,
      targetPageIndex: 1,
    });
    const released = reduce(dragging, {
      type: "END_DRAG",
      fromVirtualIndex: 3,
      targetPageIndex: 1,
      targetVirtualIndex: 3,
      isSnap: true,
      pointerReleaseVelocity: 0,
      uiReleaseVelocity: 0,
    });
    expect(released.motionPhase).toBe("idle");
  });
});

describe("repeated vs. opposite click", () => {
  const layout = makeLayout(12, 3, false);

  it("retargets one page past the in-flight destination on a same-direction repeat click", () => {
    const first = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(first.targetPageIndex).toBe(1);

    // Visual is at 0.2 — still inside page 0. A repeat click does not just
    // accelerate motion toward page 1; it skips page 1 and retargets to
    // "two pages ahead of the visual page" === page 2. The motion runner
    // sees the new target and rebuilds the active segment with the
    // fast-repeat profile, so the deck visibly continues past page 1.
    const second = reduce(first, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0.2,
    });
    expect(second.isRepeatedClickAdvance).toBe(true);
    expect(second.targetPageIndex).toBe(2);
    expect(second.virtualIndex).toBe(6); // pageStart(2, stepSize=3)
  });

  it("holds the +2 target while visual stays inside the same page during a burst", () => {
    let next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(1);

    next = reduce(next, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0.2,
    });
    expect(next.targetPageIndex).toBe(2);

    // Two more clicks while visual creeps inside page 0 — target stays at 2,
    // each click only refreshes fromVirtualIndex and keeps the fast-repeat
    // flag on for the motion runner.
    next = reduce(next, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 1.2,
    });
    expect(next.targetPageIndex).toBe(2);
    expect(next.isRepeatedClickAdvance).toBe(true);

    next = reduce(next, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 2.5,
    });
    expect(next.targetPageIndex).toBe(2);
    expect(next.isRepeatedClickAdvance).toBe(true);
  });

  it("retargets two pages ahead as visual progresses past a page boundary mid-burst", () => {
    // Click 1 from idle: start motion toward page 1.
    let next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(1);

    // Click 2 with visual still inside page 0 — retarget to page 2 (skip 1).
    next = reduce(next, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 1.5,
    });
    expect(next.targetPageIndex).toBe(2);
    expect(next.isRepeatedClickAdvance).toBe(true);

    // Click 3 after visual crossed into page 1 — retarget to page 3.
    next = reduce(next, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 3.4,
    });
    expect(next.targetPageIndex).toBe(3);
    expect(next.isRepeatedClickAdvance).toBe(true);
  });

  it("retargets backwards two pages ahead of visual in reverse", () => {
    // From idle, click backwards: cyclic wrap, target=3.
    let next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    expect(next.targetPageIndex).toBe(3);

    // Visual is still inside page 0 going backwards (ceil(-0.4/3) === 0):
    // retarget skips page 3 and aims for page 2.
    next = reduce(next, {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: -0.4,
    });
    expect(next.targetPageIndex).toBe(2);
    expect(next.isRepeatedClickAdvance).toBe(true);

    // Visual crossed into the previous virtual page (ceil(-3.2/3) === -1,
    // i.e. cyclic page 3): retarget two more pages back, cyclic page 1.
    next = reduce(next, {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: -3.2,
    });
    expect(next.targetPageIndex).toBe(1);
    expect(next.isRepeatedClickAdvance).toBe(true);
  });

  it("never gets the deck more than two pages ahead of the live visual page across a 50-click burst", () => {
    // 50 spam clicks while visual creeps forward but stays inside page 0:
    // the destination is page 2 from click 2 onwards, regardless of how many
    // more clicks follow.
    let next = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    for (let i = 0; i < 49; i += 1) {
      const visual = 0.01 * i; // creep, never past page 0 (< 3.0)
      next = reduce(next, {
        type: "MOVE",
        step: 1,
        moveReason: "click",
        fromVirtualIndex: visual,
      });
    }
    expect(next.targetPageIndex).toBe(2);
    expect(next.isRepeatedClickAdvance).toBe(true);
  });

  it("does not flag an opposite-direction click as a repeated advance and routes through the normal advance path", () => {
    const first = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    const reversed = reduce(first, {
      type: "MOVE",
      step: -1,
      moveReason: "click",
      fromVirtualIndex: 3,
    });
    expect(reversed.isRepeatedClickAdvance).toBe(false);
    expect(reversed.targetPageIndex).toBe(0);
  });

  it("does not short-circuit autoplay MOVEs during in-flight motion", () => {
    const first = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "autoplay",
      fromVirtualIndex: 0,
    });
    const second = reduce(first, {
      type: "MOVE",
      step: 1,
      moveReason: "autoplay",
      fromVirtualIndex: 0.2,
    });
    // Autoplay cadence is paced externally; the reducer should still advance
    // the destination, since rapid-click bounding is a click-only concern.
    expect(second.targetPageIndex).toBe(2);
    expect(second.isRepeatedClickAdvance).toBe(false);
  });

  it("lets the first click after settle resume normal advancement", () => {
    const first = reduce(buildInitialState(layout), {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0,
    });
    const burst = reduce(first, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 0.5,
    });
    // The repeat click skipped page 1 and retargeted to page 2.
    expect(burst.targetPageIndex).toBe(2);

    const settled = reduce(burst, {
      type: "MOTION_SETTLED",
      settledPosition: 6, // pageStart(2, stepSize=3)
    });
    expect(settled.motionPhase).toBe("idle");

    // From idle the click is no longer a same-direction repeat — the cursor
    // is the now-settled `targetPageIndex` (2), so a fresh forward click
    // advances by one to page 3.
    const afterSettle = reduce(settled, {
      type: "MOVE",
      step: 1,
      moveReason: "click",
      fromVirtualIndex: 6,
    });
    expect(afterSettle.targetPageIndex).toBe(3);
  });
});

describe("instant mode", () => {
  it("collapses a MOVE to the step-instant phase", () => {
    const layout = makeLayout(12, 3, false);
    const next = reduce(
      buildInitialState(layout),
      { type: "MOVE", step: 1, moveReason: "click", fromVirtualIndex: 0 },
      layout,
      true,
    );
    expect(next.motionPhase).toBe("step-instant");
  });
});
