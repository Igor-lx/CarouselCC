import { describe, expect, it } from "vitest";

import {
  CAROUSEL_SWIPE_CONFIG,
  SWIPE_COMMIT_MAX_PX,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_COMMIT_SLOT_SHARE,
} from "../config";
import {
  SWIPE_REFERENCE_SLOT_PX,
  resolveSlotAdaptiveSwipeConfig,
} from "./slotAdaptiveSwipe";

describe("resolveSlotAdaptiveSwipeConfig", () => {
  it("returns the base config untouched before the first measurement", () => {
    expect(resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, null)).toBe(
      CAROUSEL_SWIPE_CONFIG,
    );
    expect(resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 0)).toBe(
      CAROUSEL_SWIPE_CONFIG,
    );
  });

  it("disables the engine's host-relative threshold and delivers the commit distance resolved", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 500);
    expect(resolved.swipeThresholdRatio).toBe(0);
    // Mirror the formula (share of the slot inside the ergonomic clamps), so
    // hand-tuning the knobs never fails a mechanism assertion.
    expect(resolved.minSwipeDistance).toBeCloseTo(
      Math.min(
        Math.max(500 * SWIPE_COMMIT_SLOT_SHARE, SWIPE_COMMIT_MIN_PX),
        SWIPE_COMMIT_MAX_PX,
      ),
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
    const tinySlot = (SWIPE_COMMIT_MIN_PX / SWIPE_COMMIT_SLOT_SHARE) * 0.5;
    const hugeSlot = (SWIPE_COMMIT_MAX_PX / SWIPE_COMMIT_SLOT_SHARE) * 2;
    const tiny = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, tinySlot);
    const huge = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, hugeSlot);
    expect(tiny.minSwipeDistance).toBe(SWIPE_COMMIT_MIN_PX);
    expect(huge.minSwipeDistance).toBe(SWIPE_COMMIT_MAX_PX);
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

  it("touches nothing else in the config", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 500);
    const {
      swipeThresholdRatio,
      minSwipeDistance,
      resistanceCurvature,
      quickFlickVelocity,
      quickFlickMinOffset,
      ...rest
    } = resolved;
    const {
      swipeThresholdRatio: _r,
      minSwipeDistance: _m,
      resistanceCurvature: _c,
      quickFlickVelocity: _v,
      quickFlickMinOffset: _o,
      ...baseRest
    } = CAROUSEL_SWIPE_CONFIG;
    expect(rest).toEqual(baseRest);
  });
});
