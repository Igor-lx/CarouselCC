import type { PointerSwipeConfig } from "../../../../shared";
import {
  SWIPE_COMMIT_MAX_PX,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_COMMIT_SLOT_SHARE,
} from "../config";

/**
 * NOT a tuning knob — a calibration RECORD for `resolveSlotAdaptiveSwipeConfig`
 * below (which is why it lives here, next to the computation, and not among
 * the tuning constants in `config/gesture.ts`). It answers one question:
 * "at what measured slot width do the raw numbers of `CAROUSEL_SWIPE_CONFIG`
 * (specifically `resistanceCurvature`, a per-px quantity) mean exactly
 * themselves, with no rescaling?" The rubber was hand-tuned on the stand
 * whose slot measured ≈400px; the resolver keeps that feel identical
 * everywhere by rescaling the curvature by `reference / measured slot`
 * (half the slot → double the curvature).
 *
 * Never adjust it for new image sets, slide sizes or breakpoints — the
 * measured slot adapts by itself. The ONLY reason to touch it: the rubber
 * numbers were re-tuned by hand while looking at a slot of a different size,
 * and that size becomes the new record of where the numbers were born.
 */
export const SWIPE_REFERENCE_SLOT_PX = 400;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Translate the carousel's content-relative swipe semantics into the
 * engine's absolute px config for the given measured slot. Pure; `null`
 * slot (pre-measure / SSR) returns the base config untouched.
 *
 * The knobs it translates (`SWIPE_COMMIT_SLOT_SHARE` and the ergonomic
 * clamps) are tuning constants and stay in `config/gesture.ts`; this module
 * owns only the computation and its calibration record.
 *
 * `swipeThresholdRatio: 0` deliberately disables the engine's host-relative
 * threshold: the commit distance is delivered fully resolved via
 * `minSwipeDistance` (the engine's floor passes it through unmodified), so
 * the engine stays generic and the slot semantics stay carousel-owned.
 */
export const resolveSlotAdaptiveSwipeConfig = (
  base: Required<PointerSwipeConfig>,
  slotPx: number | null,
): Required<PointerSwipeConfig> => {
  if (slotPx === null || !(slotPx > 0)) return base;
  const slotScale = slotPx / SWIPE_REFERENCE_SLOT_PX;
  return {
    ...base,
    swipeThresholdRatio: 0,
    minSwipeDistance: clamp(
      slotPx * SWIPE_COMMIT_SLOT_SHARE,
      SWIPE_COMMIT_MIN_PX,
      SWIPE_COMMIT_MAX_PX,
    ),
    resistanceCurvature:
      base.resistanceCurvature * (SWIPE_REFERENCE_SLOT_PX / slotPx),
    // Flick qualification is CONTENT-relative: "fast/far enough to be a
    // flick" is a judgement about motion relative to one slide, so the
    // px-domain thresholds scale WITH the slot (unlike the curvature,
    // which scales inversely — it is a per-px quantity). Without this a
    // fixed px/ms threshold is proportionally hair-triggered on any slot
    // larger than the calibration one and numb on smaller ones.
    quickFlickVelocity: base.quickFlickVelocity * slotScale,
    quickFlickMinOffset: base.quickFlickMinOffset * slotScale,
  };
};
