// See docs/architecture/gesture.md
import type { PointerSwipeConfig } from "../../../../shared";
import type { CarouselSwipeConfig } from "../config";

/** Calibration RECORD (not a knob): the slot width the rubber numbers were
 * hand-tuned at, anchoring the curvature/flick rescales below. */
export const SWIPE_REFERENCE_SLOT_PX = 400;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Translate the carousel's content-relative swipe tuning into the engine's
 * absolute px config for the measured slot (pure). */
export const resolveSlotAdaptiveSwipeConfig = (
  base: CarouselSwipeConfig,
  slotPx: number | null,
): Required<PointerSwipeConfig> => {
  // `commit` = the carousel-unit group this resolver translates; `engine` = the
  // rest (some fields still rescaled below). swipeThresholdRatio: 0 retires the
  // engine's host-relative threshold — commit distance is delivered resolved.
  const { commit, ...engine } = base;

  // Pre-measure: no slot to scale to, so deliver the commit distance at its
  // floor. A real gesture always outlives the first measurement.
  if (slotPx === null || !(slotPx > 0)) {
    return {
      ...engine,
      swipeThresholdRatio: 0,
      minSwipeDistance: commit.minPx,
    };
  }

  const slotScale = slotPx / SWIPE_REFERENCE_SLOT_PX;
  return {
    ...engine,
    swipeThresholdRatio: 0,
    minSwipeDistance: clamp(
      slotPx * commit.slotShare,
      commit.minPx,
      commit.maxPx,
    ),
    resistanceCurvature:
      engine.resistanceCurvature * (SWIPE_REFERENCE_SLOT_PX / slotPx),
    // Flick thresholds scale WITH the slot (curvature scales inversely — it's
    // a per-px quantity); flick qualification is content-relative.
    quickFlickVelocity: engine.quickFlickVelocity * slotScale,
    quickFlickMinOffset: engine.quickFlickMinOffset * slotScale,
  };
};
