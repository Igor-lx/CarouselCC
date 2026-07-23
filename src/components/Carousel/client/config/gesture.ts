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

/**
 * Drag/swipe tuning specific to the carousel. These values control the *feel*
 * of touch dragging and are part of the visual contract.
 */
export const CAROUSEL_SWIPE_CONFIG: CarouselSwipeConfig = {
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
  // The catch window: a press must rest this long before it BRAKES a moving
  // strip (catch-and-hold). Inside the window a vertical intent hands the
  // gesture to the browser with the ride untouched — this is what keeps a
  // page scroll STARTED on the strip from hitching it — a horizontal intent
  // activates the takeover immediately, and a quicker lift stays a clean
  // tap. Measured on device: a human finger INTENDING to scroll rests
  // 100-250ms on the glass before its first move (90ms caught most real
  // scrolls and braked the ride they crossed). A deliberate catch rests far
  // longer. 0 = brake on contact. Must stay well below the OS long-press
  // (~500ms), or the context menu would open before the catch (relation
  // check enforces it).
  catchDelayMs: 250,
  // The swipe-commit threshold, in the carousel's own units (see
  // SwipeCommitConfig). The resolver turns this into the engine's
  // minSwipeDistance for the measured slot; the engine's own
  // swipeThresholdRatio is always forced to 0.
  commit: {
    slotShare: 0.11,
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
