import { describe, expect, it } from "vitest";

import { buildCarouselConfig } from "../../config";
import {
  hasReachedDragTarget,
  isSameDirectionRepeat,
  resolveStepTransition,
} from "../transitions";
import type { CarouselState } from "../types";
import { makeLayout, makeState } from "./layoutBuilder";

/**
 * The step arithmetic had no test of its own: the reducer exercised it, but
 * only along the paths the reducer happens to take, and the mutation run
 * showed the cost — a third of this file could be broken without a single
 * assertion noticing.
 *
 * The three exported functions decide where a step lands, whether a click
 * counts as a repeat of the one still in flight, and whether a released
 * finger is already home. Each is wrong in a way that reads as "the carousel
 * fights me" rather than as a crash.
 */

const motion = buildCarouselConfig({}).motion;

const stateWith = (
  slideCount: number,
  isFinite: boolean,
  patch: Partial<CarouselState> = {},
): CarouselState => ({
  ...makeState(makeLayout(slideCount, 3, isFinite)),
  ...patch,
});

describe("isSameDirectionRepeat", () => {
  const riding = (patch: Partial<CarouselState>) =>
    stateWith(12, false, {
      motionPhase: "step-normal",
      fromVirtualIndex: 0,
      virtualIndex: 3,
      ...patch,
    });

  it("a ride moving the same way as the click is a repeat", () => {
    expect(isSameDirectionRepeat(riding({}), 1)).toBe(true);
  });

  it("a ride moving the other way is not", () => {
    expect(isSameDirectionRepeat(riding({}), -1)).toBe(false);
  });

  it("origin and position are subtracted, not added", () => {
    // With `+` in place of `-` a ride from 6 back to 3 still reads as forward,
    // and the lookahead pushes the deck two pages past where the user aimed.
    const backwards = riding({ fromVirtualIndex: 6, virtualIndex: 3 });
    expect(isSameDirectionRepeat(backwards, -1)).toBe(true);
    expect(isSameDirectionRepeat(backwards, 1)).toBe(false);
  });

  it("a deck at rest is never a repeat", () => {
    expect(isSameDirectionRepeat(riding({ motionPhase: "idle" }), 1)).toBe(
      false,
    );
  });

  it("a deck under the finger is never a repeat", () => {
    expect(isSameDirectionRepeat(riding({ motionPhase: "dragging" }), 1)).toBe(
      false,
    );
  });

  it("a ride that has not moved yet has no direction to repeat", () => {
    expect(
      isSameDirectionRepeat(
        riding({ fromVirtualIndex: 3, virtualIndex: 3 }),
        1,
      ),
    ).toBe(false);
  });

  it("a zero step is not a direction", () => {
    expect(isSameDirectionRepeat(riding({}), 0)).toBe(false);
  });

  it("a zero step on a deck that has not moved is still not a repeat", () => {
    // Both directions are zero here, so only the early return separates them.
    // Without it the two zeroes compare equal and a click with no step reads
    // as a repeat of a ride that is not happening.
    expect(
      isSameDirectionRepeat(
        riding({ fromVirtualIndex: 3, virtualIndex: 3 }),
        0,
      ),
    ).toBe(false);
  });
});

describe("hasReachedDragTarget", () => {
  it("is a strict comparison: exactly epsilon away is NOT home", () => {
    expect(hasReachedDragTarget(0, 0.5, 0.5)).toBe(false);
    expect(hasReachedDragTarget(0, 0.4999, 0.5)).toBe(true);
  });

  it("measures distance, so the sign of the gap does not matter", () => {
    expect(hasReachedDragTarget(3, 2.9999, 0.5)).toBe(true);
    expect(hasReachedDragTarget(2.9999, 3, 0.5)).toBe(true);
  });
});

describe("resolveStepTransition — phase", () => {
  const state = stateWith(12, false);
  const move = { type: "MOVE" as const, step: 1, moveReason: "click" as const };

  it("an instant COMMAND lands instantly, whatever the mode", () => {
    expect(
      resolveStepTransition(state, { ...move, isInstant: true }, false, motion)
        .phase,
    ).toBe("step-instant");
  });

  it("an instant MODE lands instantly, whatever the command", () => {
    expect(resolveStepTransition(state, move, true, motion).phase).toBe(
      "step-instant",
    );
  });

  it("neither one animates normally", () => {
    expect(resolveStepTransition(state, move, false, motion).phase).toBe(
      "step-normal",
    );
  });

  it("a GO_TO jumps rather than steps", () => {
    const goTo = {
      type: "GO_TO" as const,
      targetPageIndex: 2,
      moveReason: "click" as const,
    };
    expect(resolveStepTransition(state, goTo, false, motion).phase).toBe(
      "step-jump",
    );
  });
});

describe("resolveStepTransition — where the step lands", () => {
  const move = { type: "MOVE" as const, step: 1, moveReason: "click" as const };

  it("on the last page of a finite deck a step leads nowhere", () => {
    // The distance is the target page minus the current one. With `+` the
    // clamped step at the edge turns into a jump forward nobody asked for.
    const atEnd = stateWith(12, true, { targetPageIndex: 3, virtualIndex: 9 });
    const r = resolveStepTransition(atEnd, move, false, motion);
    expect(r.nextTargetPageIndex).toBe(3);
    expect(r.nextVirtualIndex).toBe(9);
  });

  it("a cyclic deck steps past the edge instead of clamping", () => {
    const cyclic = stateWith(12, false, {
      targetPageIndex: 3,
      virtualIndex: 9,
    });
    const r = resolveStepTransition(cyclic, move, false, motion);
    expect(r.nextTargetPageIndex).toBe(0);
    expect(r.nextVirtualIndex).toBe(12);
  });

  it("the origin comes from the command when the command names one", () => {
    const state = stateWith(12, false, { virtualIndex: 3 });
    const r = resolveStepTransition(
      state,
      { ...move, fromVirtualIndex: 6 },
      false,
      motion,
    );
    expect(r.nextFromVirtualIndex).toBe(6);
  });

  it("and from the state when it does not", () => {
    const state = stateWith(12, false, { virtualIndex: 3 });
    expect(
      resolveStepTransition(state, move, false, motion).nextFromVirtualIndex,
    ).toBe(3);
  });
});

/**
 * A cyclic deck has no absolute page start: page 1 of an eight-page deck lives
 * at lane 3, 27, 51, … and which one the step lands on is decided by a
 * reference lane. Mid-flight the reference is where the deck IS; at rest it is
 * where the command says the step starts. Pick the wrong one and the deck
 * flies a whole period backwards while the dots say it moved one page.
 */
describe("resolveStepTransition — the reference lane in a cyclic deck", () => {
  const move = {
    type: "MOVE" as const,
    step: 1,
    moveReason: "click" as const,
    fromVirtualIndex: 3,
  };
  const cyclic = (patch: Partial<CarouselState>) =>
    stateWith(24, false, { targetPageIndex: 1, virtualIndex: 27, ...patch });

  it("a deck in flight measures from the lane it currently occupies", () => {
    const r = resolveStepTransition(
      cyclic({ motionPhase: "step-normal" }),
      move,
      false,
      motion,
    );
    expect(r.nextVirtualIndex).toBe(30);
  });

  it("a deck at rest measures from the lane the command names", () => {
    const r = resolveStepTransition(
      cyclic({ motionPhase: "idle" }),
      move,
      false,
      motion,
    );
    expect(r.nextVirtualIndex).toBe(6);
  });
});

describe("resolveStepTransition — GO_TO on a finite deck", () => {
  const finite = stateWith(12, true, { targetPageIndex: 0, virtualIndex: 0 });
  const goTo = (targetPageIndex: number) => ({
    type: "GO_TO" as const,
    targetPageIndex,
    moveReason: "click" as const,
  });

  it("a target past the last page lands on the last page", () => {
    const r = resolveStepTransition(finite, goTo(9), false, motion);
    expect(r.nextTargetPageIndex).toBe(3);
    expect(r.nextVirtualIndex).toBe(9);
  });

  it("a target before the first page lands on the first", () => {
    expect(
      resolveStepTransition(finite, goTo(-2), false, motion)
        .nextTargetPageIndex,
    ).toBe(0);
  });
});

/**
 * The teleport plan is built for GO_TO only, and only while the move is
 * animated. Each of the three conditions costs something real if it drops: a
 * MOVE would teleport (a click on the arrow blinks the deck), and an instant
 * jump would animate a preflight it is supposed to skip.
 */
describe("resolveStepTransition — who gets a teleport plan", () => {
  const far = stateWith(24, false, { targetPageIndex: 0, virtualIndex: 0 });
  const goTo = {
    type: "GO_TO" as const,
    targetPageIndex: 5,
    moveReason: "click" as const,
  };

  it("an animated far GO_TO flies a preflight and keeps the far landing apart", () => {
    const r = resolveStepTransition(far, goTo, false, motion);
    expect(r.nextVirtualIndex).toBe(3);
    expect(r.nextTeleportVirtualIndex).toBe(15);
  });

  it("a MOVE of the same span does not teleport, however far it reaches", () => {
    const r = resolveStepTransition(
      far,
      { type: "MOVE", step: 5, moveReason: "click" },
      false,
      motion,
    );
    expect(r.nextVirtualIndex).toBe(15);
    expect(r.nextTeleportVirtualIndex).toBeNull();
  });

  it("an instant command lands whole, with no preflight", () => {
    const r = resolveStepTransition(
      far,
      { ...goTo, isInstant: true },
      false,
      motion,
    );
    expect(r.nextVirtualIndex).toBe(15);
    expect(r.nextTeleportVirtualIndex).toBeNull();
  });

  it("instant mode does the same to a plain GO_TO", () => {
    const r = resolveStepTransition(far, goTo, true, motion);
    expect(r.nextVirtualIndex).toBe(15);
    expect(r.nextTeleportVirtualIndex).toBeNull();
  });
});
