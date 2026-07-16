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
  resistance: 0.33,
  // Rubber length: the resistance curve saturates at
  // 1 / (curvature * r/(1-r)) px of UI travel — the "wall" the finger hits.
  // (Round-number example: r=0.5, c=0.005 -> wall at 200px.) Lower r or
  // lower c -> softer early ramp and a farther wall. The curvature is
  // slot-rescaled at runtime (gesture/slotAdaptiveSwipe.ts), so the wall
  // sits at the same RELATIVE pull on any slot.
  resistanceCurvature: 0.0046,
  maxVelocity: 4,
  emaAlpha: 0.85,
  // Flick qualification, CONTENT-RELATIVE: both values are calibrated for
  // the reference slot and rescaled by `slot / reference` at runtime
  // (gesture/slotAdaptiveSwipe.ts), so "how fast/far counts as a flick"
  // feels identical on any slot and device. At the reference slot the
  // velocity reads directly in px/ms and the offset in px.
  quickFlickVelocity: 0.25,
  quickFlickMinOffset: 20,
  // Flick memory: the flick decision and the release speed judge the whole
  // gesture (weighted-average velocity), not its last segment, and survive a
  // finger settling before lift-off (grace, then half-life decay).
  flickVelocityAlpha: 0.45,
  flickPauseGraceMs: 120,
  flickVelocityHalfLifeMs: 250,
  minSwipeDistance: 20,
  swipeThresholdRatio: 0.23,
  // The catch window: a press must rest this long before it BRAKES a moving
  // strip (catch-and-hold). Inside the window a vertical intent hands the
  // gesture to the browser with the ride untouched — this is what keeps a
  // page scroll STARTED on the strip from hitching it — a horizontal intent
  // activates the takeover immediately, and a quicker lift stays a clean
  // tap. 0 = brake on contact (re-introduces the scroll hitch). Must stay
  // well below the OS long-press (~500ms), or the context menu would open
  // before the catch (see the relation check).
  catchDelayMs: 90,
};

/**
 * Slot-adaptive swipe normalization KNOBS. The engine works in absolute px
 * of the HOST element, but the user's eye works in slots — "how far did the
 * content move relative to one slide". A fixed host-relative threshold
 * therefore drifts with `visibleSlidesNr`: at 1 visible slide it commits at
 * ~11% of a slide, at 3 it demands ~32%. These constants let the carousel
 * adapter translate content semantics into the engine's absolute units,
 * reactively to the measured slot. The computation itself (and its
 * calibration record) lives with the gesture logic:
 * `gesture/slotAdaptiveSwipe.ts`.
 *
 * - `SWIPE_COMMIT_SLOT_SHARE` — raw finger travel, as a fraction of the slot
 *   width, that commits a slow (non-flick) swipe. Calibrated to match the
 *   proven single-slide phone feel.
 * - `SWIPE_COMMIT_MIN_PX` / `SWIPE_COMMIT_MAX_PX` — ergonomic clamps: a
 *   finger's comfortable travel does not scale with the screen, so extreme
 *   slots must not produce a hair-trigger or a half-metre swipe.
 *
 * Diagnostics audit the values and their pairing (clamps ordered; the share
 * at the reference slot must land inside the clamps).
 */
export const SWIPE_COMMIT_SLOT_SHARE = 0.11;
export const SWIPE_COMMIT_MIN_PX = 20;
export const SWIPE_COMMIT_MAX_PX = 120;

/**
 * Inertial release tuning. `inertiaBoost` makes a fast swipe land faster than
 * a passive base duration would imply; the deceleration share shapes the
 * smooth tail.
 */
export const CAROUSEL_INERTIAL_RELEASE_CONFIG: CarouselInertialReleaseConfig = {
  inertiaBoost: 1.45,
  accelerationDistanceShare: 0.3,
  decelerationDistanceShare: 0.55,
  minRideDurationMs: 210,
};
