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
      const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, slot);
      expect(resolved.swipeThresholdRatio).toBe(0);
      expect(resolved.minSwipeDistance).toBe(MIN_PX);
      expect(resolved.resistanceCurvature).toBe(
        CAROUSEL_SWIPE_CONFIG.resistanceCurvature,
      );
      expect("commit" in resolved).toBe(false);
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
    const tiny = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, tinySlot);
    const huge = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, hugeSlot);
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
    const { commit: _commit, resistanceCurvature, quickFlickVelocity, quickFlickMinOffset, ...baseRest } =
      CAROUSEL_SWIPE_CONFIG;
    void resistanceCurvature;
    void quickFlickVelocity;
    void quickFlickMinOffset;
    expect(rest).toEqual(baseRest);
  });
});
