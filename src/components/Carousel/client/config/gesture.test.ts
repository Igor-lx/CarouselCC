import { describe, expect, it } from "vitest";

import {
  CAROUSEL_SWIPE_CONFIG,
  SWIPE_COMMIT_MAX_PX,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_COMMIT_SLOT_SHARE,
  SWIPE_REFERENCE_SLOT_PX,
  resolveSlotAdaptiveSwipeConfig,
} from "./gesture";

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
    expect(resolved.minSwipeDistance).toBeCloseTo(500 * SWIPE_COMMIT_SLOT_SHARE, 10);
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
    const big = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 800);
    const small = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 200);
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
    const tiny = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 50);
    const huge = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 5000);
    expect(tiny.minSwipeDistance).toBe(SWIPE_COMMIT_MIN_PX);
    expect(huge.minSwipeDistance).toBe(SWIPE_COMMIT_MAX_PX);
  });

  it("touches nothing else in the config", () => {
    const resolved = resolveSlotAdaptiveSwipeConfig(CAROUSEL_SWIPE_CONFIG, 500);
    const { swipeThresholdRatio, minSwipeDistance, resistanceCurvature, ...rest } =
      resolved;
    const {
      swipeThresholdRatio: _r,
      minSwipeDistance: _m,
      resistanceCurvature: _c,
      ...baseRest
    } = CAROUSEL_SWIPE_CONFIG;
    expect(rest).toEqual(baseRest);
  });
});
