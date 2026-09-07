import { describe, expect, it } from "vitest";

import { CAROUSEL_SWIPE_CONFIG } from "../../config";
import {
  SWIPE_REFERENCE_SLOT_PX,
  resolveSlotAdaptiveSwipeConfig,
} from "../slotAdaptiveSwipe";

const {
  slotShare: SLOT_SHARE,
  minPx: MIN_PX,
  maxPx: MAX_PX,
} = CAROUSEL_SWIPE_CONFIG.commit;

describe("resolveSlotAdaptiveSwipeConfig", () => {
  it("before the first measurement, yields a valid engine config at the floor", () => {
    // No slot to scale to: engine fields pass through, the host-relative path
    // is off, and the commit distance sits at its ergonomic floor. (The base
    // is a CarouselSwipeConfig — it has no minSwipeDistance to hand back.)
    for (const slot of [null, 0] as const) {
      const resolved = resolveSlotAdaptiveSwipeConfig(
        CAROUSEL_SWIPE_CONFIG,
        slot,
      );
      expect(resolved.swipeThresholdRatio).toBe(0);
      expect(resolved.minSwipeDistance).toBe(MIN_PX);
      expect(resolved.resistanceCurvature).toBe(
        CAROUSEL_SWIPE_CONFIG.resistanceCurvature,
      );
      expect("commit" in resolved).toBe(false);
    }
  });

  // The guard has to be TOTAL, not merely non-empty. Its previous form
  // (`!(slotPx > 0)`) cut zero, negatives and NaN and let INFINITY through as a
  // real slot — the four scaled fields then came out `Infinity` and `0`, a
  // non-finite setting handed to the engine. Found by a probe; the eight tests
  // standing here at the time all stayed green, because they pinned `null` and
  // `0` only, and BOTH forms answer the same on those two.
  it("treats every degenerate slot as no slot, infinity included", () => {
    for (const slot of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -50,
    ]) {
      const resolved = resolveSlotAdaptiveSwipeConfig(
        CAROUSEL_SWIPE_CONFIG,
        slot,
      );
      expect(resolved.minSwipeDistance, String(slot)).toBe(MIN_PX);
      expect(resolved.quickFlickVelocity, String(slot)).toBe(
        CAROUSEL_SWIPE_CONFIG.quickFlickVelocity,
      );
    }
  });

  // What the engine's door would refuse. Stated here as a property of the
  // resolver rather than left to the door, because this is where such a value
  // would be MANUFACTURED — the door only reports that one arrived, and by then
  // the carousel is already down. Slots span a phone column to a wide desktop
  // slot, plus the degenerate ones.
  it("never manufactures a non-finite setting, at any slot", () => {
    const slots = [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY];
    for (let px = 1; px <= 4000; px += 7) slots.push(px);

    for (const slot of slots) {
      const resolved = resolveSlotAdaptiveSwipeConfig(
        CAROUSEL_SWIPE_CONFIG,
        slot,
      );
      for (const [field, value] of Object.entries(resolved)) {
        expect(Number.isFinite(value), `slot ${String(slot)} → ${field}`).toBe(
          true,
        );
      }
    }
  });
  it("disables the engine's host-relative threshold and delivers the commit distance resolved", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 500);
    expect(resolved.swipeThresholdRatio).toBe(0);
    // Mirror the formula (share of the slot inside the ergonomic clamps), so
    // hand-tuning the knobs never fails a mechanism assertion.
    expect(resolved.minSwipeDistance).toBeCloseTo(
      Math.min(Math.max(500 * SLOT_SHARE, MIN_PX), MAX_PX),
      10,
    );
  });

  it("keeps the calibration point intact: at the reference slot the curvature is the base one", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX,
    );
    expect(resolved.resistanceCurvature).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.resistanceCurvature,
      12,
    );
  });

  it("rescales the rubber inversely to the slot (bigger slot, softer per-px curvature)", () => {
    const big = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX * 2,
    );
    const small = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX / 2,
    );
    expect(big.resistanceCurvature).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.resistanceCurvature / 2,
      12,
    );
    expect(small.resistanceCurvature).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.resistanceCurvature * 2,
      12,
    );
  });

  it("clamps the commit distance to the ergonomic bounds on extreme slots", () => {
    // Slots chosen FROM the knobs so the clamps engage for any sane tuning.
    const tinySlot = (MIN_PX / SLOT_SHARE) * 0.5;
    const hugeSlot = (MAX_PX / SLOT_SHARE) * 2;
    const tiny = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      tinySlot,
    );
    const huge = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      hugeSlot,
    );
    expect(tiny.minSwipeDistance).toBe(MIN_PX);
    expect(huge.minSwipeDistance).toBe(MAX_PX);
  });

  it("scales the flick qualification WITH the slot (content-relative feel)", () => {
    const double = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX * 2,
    );
    const half = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX / 2,
    );
    expect(double.quickFlickVelocity).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickVelocity * 2,
      12,
    );
    expect(double.quickFlickMinOffset).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickMinOffset * 2,
      12,
    );
    expect(half.quickFlickVelocity).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickVelocity / 2,
      12,
    );
    expect(half.quickFlickMinOffset).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickMinOffset / 2,
      12,
    );
  });

  it("keeps the calibration point intact for the flick thresholds too", () => {
    const atRef = resolveSlotAdaptiveSwipeConfig(
      CAROUSEL_SWIPE_CONFIG,
      SWIPE_REFERENCE_SLOT_PX,
    );
    expect(atRef.quickFlickVelocity).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickVelocity,
      12,
    );
    expect(atRef.quickFlickMinOffset).toBeCloseTo(
      CAROUSEL_SWIPE_CONFIG.quickFlickMinOffset,
      12,
    );
  });

  it("passes every non-translated engine field straight through", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 500);
    // Strip the fields the resolver OWNS (computed) or RESCALES from the
    // resolved config, and the `commit` group from the base; what remains must
    // be identical — the passthrough set.
    const {
      swipeThresholdRatio: _r,
      minSwipeDistance: _m,
      resistanceCurvature: _c,
      quickFlickVelocity: _v,
      quickFlickMinOffset: _o,
      ...rest
    } = resolved;
    const {
      commit: _commit,
      resistanceCurvature,
      quickFlickVelocity,
      quickFlickMinOffset,
      ...baseRest
    } = CAROUSEL_SWIPE_CONFIG;
    void resistanceCurvature;
    void quickFlickVelocity;
    void quickFlickMinOffset;
    expect(rest).toEqual(baseRest);
  });
});
