import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

/**
 * The engine's release config plus the carousel's own profile knobs — both
 * consumed by the carousel's segment factory, not by the engine.
 *
 * `accelerationDistanceShare` implements the CONTINUITY LAUNCH (the etalon
 * behaviour of native scroll physics): the release segment starts at the
 * VISUAL velocity the eye saw at lift-off and ramps up to the intent speed
 * (flick memory × boost) over this share of the distance — content never
 * jumps to a higher speed than it visibly had, it accelerates there. With a
 * fast lift-off (start ≈ intent) the ramp collapses to nothing by itself.
 */
export interface CarouselInertialReleaseConfig extends InertialReleaseConfig {
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
  /**
   * Floor on the ride duration: a vigorous flick on a narrow slot (portrait,
   * one visible slide) can otherwise collapse the ride to a few dozen ms —
   * 1–3 painted frames on a weak device, which the eye reads as a teleport,
   * not a motion. The speed intent is re-solved down so the ride never runs
   * shorter than this; continuity still wins — a launch speed that alone
   * beats the floor is never slowed (the segment simply arrives earlier).
   */
  minRideDurationMs: number;
}

/**
 * Drag/swipe tuning specific to the carousel. These values control the *feel*
 * of touch dragging and are part of the visual contract.
 */
export const CAROUSEL_SWIPE_CONFIG: Required<PointerSwipeConfig> = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.38,
  // Rubber length: the resistance curve saturates at
  // 1 / (curvature * r/(1-r)) px of UI travel — the "wall" the finger hits.
  // r=0.38, c=0.0046 -> stiffness 0.613, wall ~355px (~0.9 of the reference
  // slot): ~20% softer early ramp and ~15% longer travel than the previous
  // r=0.48 / c=0.0035 calibration (wall ~310px).
  resistanceCurvature: 0.0046,
  maxVelocity: 5,
  emaAlpha: 0.85,
  quickFlickVelocity: 0.1,
  quickFlickMinOffset: 6,
  // Flick memory: the flick decision and the release speed judge the whole
  // gesture (weighted-average velocity), not its last segment, and survive a
  // finger settling before lift-off (grace, then half-life decay).
  flickVelocityAlpha: 0.45,
  flickPauseGraceMs: 120,
  flickVelocityHalfLifeMs: 250,
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
  slotPx: number | null
): Required<PointerSwipeConfig> => {
  if (slotPx === null || !(slotPx > 0)) return base;
  return {
    ...base,
    swipeThresholdRatio: 0,
    minSwipeDistance: clamp(
      slotPx * SWIPE_COMMIT_SLOT_SHARE,
      SWIPE_COMMIT_MIN_PX,
      SWIPE_COMMIT_MAX_PX
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
  inertiaBoost: 1.5,
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.25,
  minRideDurationMs: 200,
};
