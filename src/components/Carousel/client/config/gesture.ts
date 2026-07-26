import type {
  CarouselInertialReleaseConfig,
  CarouselSwipeConfig,
} from "./types";

/**
 * Drag/swipe tuning specific to the carousel. These values control the *feel*
 * of touch dragging and are part of the visual contract. Its shape
 * (`CarouselSwipeConfig`, with the `commit` group) and the swipe/commit
 * semantics live in `config/types.ts` beside every other config type.
 */
export const CAROUSEL_SWIPE_CONFIG: CarouselSwipeConfig = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.33,
  // Rubber length: the resistance curve saturates at
  // 1 / (curvature * r/(1-r)) px of UI travel — the "wall" the finger hits.
  // Lower resistance or lower curvature -> softer early ramp and a farther
  // wall. The curvature is slot-rescaled at runtime
  // (gesture/slotAdaptiveSwipe.ts), so the wall sits at the same RELATIVE pull
  // on any slot.
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
  // The catch window: a press must rest this long before it BRAKES a moving
  // strip (catch-and-hold). Inside the window a vertical intent hands the
  // gesture to the browser with the ride untouched — this is what keeps a
  // page scroll STARTED on the strip from hitching it — a horizontal intent
  // activates the takeover immediately, and a quicker lift stays a clean
  // tap. A finger intending to scroll rests briefly on the glass before its
  // first move; a deliberate catch rests longer; zero brakes on contact. Must
  // stay well below the OS long-press, or the context menu would open before
  // the catch (relation check enforces it).
  catchDelayMs: 250,
  // The swipe-commit threshold, in the carousel's own units (see
  // SwipeCommitConfig). The resolver turns this into the engine's
  // minSwipeDistance for the measured slot; the engine's own
  // swipeThresholdRatio is always forced to 0.
  commit: {
    slotShare: 0.3,
    minPx: 20,
    maxPx: 120,
  },
};

/**
 * Inertial release tuning. `inertiaBoost` makes a fast swipe land faster than
 * a passive base duration would imply; the deceleration share shapes the
 * smooth tail.
 */
export const CAROUSEL_INERTIAL_RELEASE_CONFIG: CarouselInertialReleaseConfig = {
  inertiaBoost: 1.45,
  accelerationDistanceShare: 0.25,
  decelerationDistanceShare: 0.45,
  minRideDurationMs: 210,
};
