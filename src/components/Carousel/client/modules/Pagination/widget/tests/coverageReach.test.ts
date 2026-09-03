import { describe, expect, it } from "vitest";

import {
  ACTIVE_DOT_COUNT,
  DOT_COVERAGE_MARGIN_SLOTS,
} from "../usePaginationWidgetBinding";
import { WIDGET_STEP_LOOKAHEAD } from "../stepTarget";
import {
  widgetProjectionSide,
  widgetProjectionSlotCount,
} from "../math/spatialField";
import { activeTrajectoryIds } from "../math/trajectory";

/**
 * The widget pools a FIXED number of dot and highlight elements and reuses them;
 * a step that lands past the pool simply gets no element, and the arriving
 * page's highlight pops into place at settle instead of animating. So the pool
 * size and the step reach are one decision, and this file is where they have to
 * agree — arithmetically, for every window size, at the constants' current
 * values whatever they are.
 *
 * Everything below re-derives the binding's own index math (`writeOffset`,
 * `startWaapiStep`), so retuning `WIDGET_STEP_LOOKAHEAD` moves these bounds
 * rather than breaking them; forgetting to move a pool size with it fails here.
 */

const WINDOW_SIZES = [3, 5, 7, 9, 11];

/** Ids the resting strip paints, centred on `offset` (mirrors `writeOffset`). */
const restingIds = (offset: number, visibleCount: number) => {
  const side = widgetProjectionSide(visibleCount);
  const first = Math.round(offset) - side - DOT_COVERAGE_MARGIN_SLOTS / 2;
  const count =
    widgetProjectionSlotCount(visibleCount) + DOT_COVERAGE_MARGIN_SLOTS;
  return { low: first, high: first + count - 1 };
};

/** Ids animated for a step (mirrors `startWaapiStep`). */
const stepIds = (from: number, target: number, visibleCount: number) => {
  const side = widgetProjectionSide(visibleCount);
  const low =
    Math.floor(Math.min(from, target)) - side - DOT_COVERAGE_MARGIN_SLOTS / 2;
  const count =
    widgetProjectionSlotCount(visibleCount) + DOT_COVERAGE_MARGIN_SLOTS;
  return { low, high: low + count - 1 };
};

/** Ids that must be VISIBLE when the strip rests at `offset`. */
const visibleIds = (offset: number, visibleCount: number) => {
  const side = widgetProjectionSide(visibleCount);
  return { low: Math.round(offset) - side, high: Math.round(offset) + side };
};

/** Every landing the step rule can produce from a live `from`. */
const reachableTargets = (from: number): number[] => {
  const targets: number[] = [];
  for (
    let target = Math.ceil(from) - WIDGET_STEP_LOOKAHEAD;
    target <= Math.floor(from) + WIDGET_STEP_LOOKAHEAD;
    target += 1
  ) {
    targets.push(target);
  }
  return targets;
};

const FRACTIONS = [0, 0.1, 0.5, 0.9];

describe("widget element pool covers every reachable step", () => {
  it("the resting strip always fills its own visible window", () => {
    for (const visibleCount of WINDOW_SIZES) {
      for (const offset of [-7.5, -1, 0, 0.5, 4, 12.25]) {
        const pooled = restingIds(offset, visibleCount);
        const shown = visibleIds(offset, visibleCount);
        expect(pooled.low).toBeLessThanOrEqual(shown.low);
        expect(pooled.high).toBeGreaterThanOrEqual(shown.high);
      }
    }
  });

  it("an animated step keeps both endpoints' windows inside the pool", () => {
    for (const visibleCount of WINDOW_SIZES) {
      for (const base of [-5, 0, 3]) {
        for (const fraction of FRACTIONS) {
          const from = base + fraction;
          for (const target of reachableTargets(from)) {
            const pooled = stepIds(from, target, visibleCount);
            for (const offset of [from, target]) {
              const shown = visibleIds(offset, visibleCount);
              expect(
                pooled.low,
                `visible=${visibleCount} ${from} -> ${target} @ ${offset}`,
              ).toBeLessThanOrEqual(shown.low);
              expect(
                pooled.high,
                `visible=${visibleCount} ${from} -> ${target} @ ${offset}`,
              ).toBeGreaterThanOrEqual(shown.high);
            }
          }
        }
      }
    }
  });

  it("has exactly as many overlays as the furthest step names, no more", () => {
    // Both directions matter and only one of them used to be checked. Too few
    // overlays and the arriving page's highlight pops in at settle instead of
    // animating; too many and the widget renders an element that is `opacity:
    // 0` for its whole life. A `<=` here let a spare slot sit unnoticed — the
    // pool is DERIVED from the reach, so the two must be equal, not merely
    // compatible.
    let widest = 0;
    for (const base of [-5, 0, 3]) {
      for (const fraction of FRACTIONS) {
        const from = base + fraction;
        for (const target of reachableTargets(from)) {
          const named = activeTrajectoryIds(from, target).length;
          expect(named, `${from} -> ${target}`).toBeLessThanOrEqual(
            ACTIVE_DOT_COUNT,
          );
          widest = Math.max(widest, named);
        }
      }
    }
    expect(widest).toBe(ACTIVE_DOT_COUNT);
  });

  it("the active slot really is the pool index holding the resting offset", () => {
    // The binding stamps its active class on `side + MARGIN / 2`; that index has
    // to be the one whose id equals round(offset), or the class lands elsewhere.
    for (const visibleCount of WINDOW_SIZES) {
      for (const offset of [-3.4, 0, 2.6]) {
        const side = widgetProjectionSide(visibleCount);
        const activeSlotIndex = side + DOT_COVERAGE_MARGIN_SLOTS / 2;
        expect(restingIds(offset, visibleCount).low + activeSlotIndex).toBe(
          Math.round(offset),
        );
      }
    }
  });
});
