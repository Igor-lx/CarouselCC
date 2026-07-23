import type { PointerSwipeConfig } from "../../../../shared";
import type { CarouselSwipeConfig } from "../config";

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
 * Translate the carousel's content-relative swipe tuning
 * (`CarouselSwipeConfig`) into the engine's absolute px config
 * (`Required<PointerSwipeConfig>`) for the given measured slot. Pure.
 *
 * The knobs it translates live in `CAROUSEL_SWIPE_CONFIG.commit`
 * (`config/gesture.ts`); this module owns only the computation and its
 * calibration record.
 *
 * `swipeThresholdRatio: 0` deliberately disables the engine's host-relative
 * threshold: the commit distance is delivered fully resolved via
 * `minSwipeDistance` (the engine's floor passes it through unmodified), so
 * the engine stays generic and the slot semantics stay carousel-owned.
 */
export const resolveSlotAdaptiveSwipeConfig = (
  base: CarouselSwipeConfig,
  slotPx: number | null,
): Required<PointerSwipeConfig> => {
  // Split the two families the type encodes: `commit` is the carousel-unit
  // group this resolver OWNS the translation of; `engine` is everything the
  // engine consumes directly (some fields still rescaled below).
  const { commit, ...engine } = base;

  // Before the first measurement (SSR / first render): no slot to scale to, so
  // pass the engine fields through and deliver the commit distance at its
  // ergonomic floor. A real gesture always outlives the first measurement, so
  // this governs no committed swipe — it only keeps the shape valid.
  if (slotPx === null || !(slotPx > 0)) {
    return { ...engine, swipeThresholdRatio: 0, minSwipeDistance: commit.minPx };
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
    // Flick qualification is CONTENT-relative: "fast/far enough to be a
    // flick" is a judgement about motion relative to one slide, so the
    // px-domain thresholds scale WITH the slot (unlike the curvature,
    // which scales inversely — it is a per-px quantity). Without this a
    // fixed px/ms threshold is proportionally hair-triggered on any slot
    // larger than the calibration one and numb on smaller ones.
    quickFlickVelocity: engine.quickFlickVelocity * slotScale,
    quickFlickMinOffset: engine.quickFlickMinOffset * slotScale,
  };
};
