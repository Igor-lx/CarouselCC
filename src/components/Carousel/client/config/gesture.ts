import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

/**
 * The engine's release config plus the carousel's own profile knob: how much
 * of the remaining distance the release segment devotes to deceleration. The
 * share is consumed by the carousel's segment factory, not by the engine.
 */
export interface CarouselInertialReleaseConfig extends InertialReleaseConfig {
  decelerationDistanceShare: number;
}

/**
 * Drag/swipe tuning specific to the carousel. These values control the *feel*
 * of touch dragging and are part of the visual contract.
 */
export const CAROUSEL_SWIPE_CONFIG: Required<PointerSwipeConfig> = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.53,
  resistanceCurvature: 0.0045,
  maxVelocity: 5,
  emaAlpha: 0.85,
  quickFlickVelocity: 0.1,
  quickFlickMinOffset: 6,
  minSwipeDistance: 20,
  swipeThresholdRatio: 0.23,
};

/**
 * Slot-adaptive swipe normalization. The engine works in absolute px of the
 * HOST element, but the user's eye works in slots — "how far did the content
 * move relative to one slide". A fixed host-relative threshold therefore
 * drifts with `visibleSlidesNr`: at 1 visible slide it commits at ~11% of a
 * slide, at 3 it demands ~32%. These constants let the carousel adapter
 * translate content semantics into the engine's absolute units, reactively
 * to the measured slot (see `resolveSlotAdaptiveSwipeConfig`):
 *
 * - `SWIPE_COMMIT_SLOT_SHARE` — raw finger travel, as a fraction of the slot
 *   width, that commits a slow (non-flick) swipe. Calibrated to match the
 *   proven single-slide phone feel.
 * - `SWIPE_COMMIT_MIN_PX` / `SWIPE_COMMIT_MAX_PX` — ergonomic clamps: a
 *   finger's comfortable travel does not scale with the screen, so extreme
 *   slots must not produce a hair-trigger or a half-metre swipe.
 * - `SWIPE_REFERENCE_SLOT_PX` — the slot width at which the px-domain feel
 *   of `CAROUSEL_SWIPE_CONFIG` (its `resistanceCurvature`) was calibrated;
 *   the curvature is rescaled by `reference / slot` so the rubber reaches
 *   the same relative stiffness at the same relative pull on any slot.
 *
 * Diagnostics audit the values and their pairing (clamps ordered; the share
 * at the reference slot must land inside the clamps).
 */
export const SWIPE_COMMIT_SLOT_SHARE = 0.11;
export const SWIPE_COMMIT_MIN_PX = 20;
export const SWIPE_COMMIT_MAX_PX = 120;
export const SWIPE_REFERENCE_SLOT_PX = 400;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Translate the carousel's content-relative swipe semantics into the
 * engine's absolute px config for the given measured slot. Pure; `null`
 * slot (pre-measure / SSR) returns the base config untouched.
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
  };
};

/**
 * Inertial release tuning. `inertiaBoost` makes a fast swipe land faster than
 * a passive base duration would imply; the deceleration share shapes the
 * smooth tail.
 */
export const CAROUSEL_INERTIAL_RELEASE_CONFIG: CarouselInertialReleaseConfig = {
  inertiaBoost: 2.15,
  decelerationDistanceShare: 0.25,
};
