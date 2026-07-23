import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

// --- Gesture config shapes ------------------------------------------------
// The shapes of the two STRUCTURED gesture constants (CAROUSEL_SWIPE_CONFIG,
// CAROUSEL_INERTIAL_RELEASE_CONFIG in config/gesture.ts). They live here with
// every other config-shape type, not beside their constants, so this file
// stays the single home for config types and depends only on `shared` — the
// same split motion/interaction/layout already follow (flat constants there,
// their shapes here).

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
 * How far the finger must travel to COMMIT a swipe (advance a page) rather
 * than snap back — expressed in the carousel's OWN units, a fraction of one
 * slide. The engine works in absolute px of the whole host element (which is
 * `visibleSlidesNr` slides wide), so a fixed host-relative threshold would
 * drift with the slide count — ~11% of a slide at 1 visible, ~32% at 3. These
 * knobs stay slot-relative; the slot-adaptive resolver
 * (`gesture/slotAdaptiveSwipe.ts`) translates them into the engine's
 * `minSwipeDistance` for the measured slot, and always disables the engine's
 * own host-relative path (`swipeThresholdRatio -> 0`) so the two never fight.
 */
export interface SwipeCommitConfig {
  /** Raw finger travel that commits a slow (non-flick) swipe, as a fraction
   * of the SLOT width. Calibrated to the proven single-slide phone feel;
   * raise it to enlarge the snap-back zone (a short drag returns instead of
   * flipping). */
  slotShare: number;
  /** Ergonomic FLOOR on the resolved commit distance (px): a finger's
   * comfortable travel does not scale with the screen, so a tiny slot must
   * not become a hair-trigger. */
  minPx: number;
  /** Ergonomic CEILING (px): a huge slot must not demand a half-metre swipe. */
  maxPx: number;
}

/**
 * The carousel's whole swipe-tuning surface — everything the author sets. The
 * type IS the architecture: it is the engine's config MINUS the two fields the
 * carousel never sets by hand (`minSwipeDistance`, `swipeThresholdRatio`),
 * PLUS the `commit` group the carousel expresses in its own units. The
 * slot-adaptive resolver turns this into the full engine
 * `Required<PointerSwipeConfig>` for the measured slot — passing most fields
 * through, rescaling a few to the slot, and COMPUTING `minSwipeDistance` from
 * `commit` (see gesture/slotAdaptiveSwipe.ts).
 */
export type CarouselSwipeConfig = Omit<
  Required<PointerSwipeConfig>,
  "minSwipeDistance" | "swipeThresholdRatio"
> & { commit: SwipeCommitConfig };

export interface PropDerivedSettings {
  visibleSlidesCount: number;
  autoplayDuration: number;
  stepDuration: number;
  autoplayInterval: number;
  errorAltPlaceholder: string;
}

/**
 * Distance shares of one accel/cruise/decel motion profile — the universal
 * shape every carousel motion is expressed in (there are no easing curves).
 */
export interface MotionProfileSharesSettings {
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface MotionSettings {
  snapBackDuration: number;
  epsilon: number;
  /** Click step / non-inertial gesture release profile shape. */
  stepProfile: MotionProfileSharesSettings;
  /** Autoplay step profile shape. */
  autoplayProfile: MotionProfileSharesSettings;
  /** No-intent drag-release snap-back profile shape. */
  snapBackProfile: MotionProfileSharesSettings;
  /** @see GO_TO_PREFLIGHT_PAGE_SPAN */
  goToPreflightPageSpan: number;
  /** @see GO_TO_TELEPORT_ENABLED */
  goToTeleportEnabled: boolean;
  /** @see GO_TO_TELEPORT_MIN_PAGE_SPAN */
  goToTeleportMinPageSpan: number;
  /** @see GO_TO_FINAL_APPROACH_PAGE_SPAN */
  goToFinalApproachPageSpan: number;
  /** @see GO_TO_ACCELERATION_DISTANCE_SHARE */
  goToAccelerationDistanceShare: number;
  /** @see GO_TO_DECELERATION_DISTANCE_SHARE */
  goToDecelerationDistanceShare: number;
  /** @see GO_TO_SPEED_MULTIPLIER */
  goToSpeedMultiplier: number;
}

export interface RepeatedClickSettings {
  speedMultiplier: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface InteractionSettings {
  hoverPauseDelay: number;
  visibilityThreshold: number;
  /** Quiet window after glass/viewport activity before an autoplay tick may
   * fire (see AUTOPLAY_RESETTLE_DELAY_MS). */
  autoplayResettleDelayMs: number;
}

export interface LayoutSettings {
  renderWindowBufferMultiplier: number;
}

export interface CarouselRuntimeConfig extends PropDerivedSettings {
  motion: MotionSettings;
  repeatedClick: RepeatedClickSettings;
  interaction: InteractionSettings;
  layout: LayoutSettings;
  swipeConfig: CarouselSwipeConfig;
  releaseConfig: CarouselInertialReleaseConfig;
  dragReleaseEpsilon: number;
  /** @see GESTURE_COAST_MAX_MS */
  gestureCoastMaxMs: number;
}

export interface RawConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}
