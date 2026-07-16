import {
  atLeast,
  greaterThan,
  inRangeExclusiveLower,
  inRangeExclusiveUpper,
  inRangeInclusive,
  isFiniteNumber,
  isNonNegativeInteger,
  isPositiveInteger,
} from "../../../../../../shared";
import {
  AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
  CAROUSEL_DEFAULTS,
  AUTOPLAY_DECELERATION_DISTANCE_SHARE,
  CAROUSEL_INERTIAL_RELEASE_CONFIG,
  CAROUSEL_SWIPE_CONFIG,
  DRAG_RELEASE_EPSILON,
  FALLBACK_WRITE_FRAME_SKIP,
  GESTURE_COAST_MAX_MS,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_TELEPORT_MIN_PAGE_SPAN,
  HOVER_PAUSE_DELAY,
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
  IMAGE_RETRY_MAX_DELAY_MS,
  SLIDE_REORIENT_FADE_IN_MS,
  SLIDE_REORIENT_FADE_OUT_MS,
  SWIPE_COMMIT_MAX_PX,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_COMMIT_SLOT_SHARE,
  SLIDE_REORIENT_VEIL_MAX_MS,
  MOTION_EPSILON,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  RENDER_WINDOW_BUFFER_MULTIPLIER,
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
  SNAP_BACK_DURATION,
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
  VISIBILITY_THRESHOLD,
} from "../../../config";
import { normalizeMotionProfileShares } from "../../../../../../shared";
// The calibration record lives with the computation it anchors, not among
// the tuning knobs — see gesture/slotAdaptiveSwipe.ts.
import { SWIPE_REFERENCE_SLOT_PX } from "../../../gesture/slotAdaptiveSwipe";
import type { CarouselDiagnosticWarning } from "../types";

interface NumericRule {
  layer: string;
  field: string;
  value: number;
  expected: string;
  consequence: string;
  severity: CarouselDiagnosticWarning["severity"];
  /** Shared numeric guard (see `shared/math`) — self-sufficient, implies
   * finiteness; `checkNumber` keeps its own finite gate only as a safety
   * net for future hand-written lambdas. */
  predicate: (value: unknown) => boolean;
}

const checkNumber = (rule: NumericRule): CarouselDiagnosticWarning | null => {
  if (isFiniteNumber(rule.value) && rule.predicate(rule.value)) return null;
  return {
    severity: rule.severity,
    layer: rule.layer,
    field: rule.field,
    actual: rule.value,
    expected: rule.expected,
    consequence: rule.consequence,
  };
};

const numericRules: NumericRule[] = [
  // Motion timings / factors
  {
    layer: "Motion",
    field: "SNAP_BACK_DURATION",
    value: SNAP_BACK_DURATION,
    severity: "CRITICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Snap-back duration of zero or negative causes motion to flash or freeze",
    predicate: greaterThan(0),
  },
  {
    layer: "Motion",
    field: "REPEATED_CLICK_SPEED_MULTIPLIER",
    value: REPEATED_CLICK_SPEED_MULTIPLIER,
    severity: "LOGICAL",
    expected: "Expected a finite number greater than 1",
    consequence: "Repeated-click acceleration loses the feel of an in-flight boost",
    predicate: greaterThan(1),
  },
  {
    layer: "Motion",
    field: "REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE",
    value: REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Acceleration zone share outside [0,1] leads to malformed motion profile zones",
    predicate: inRangeInclusive(0, 1),
  },
  {
    layer: "Motion",
    field: "REPEATED_CLICK_DECELERATION_DISTANCE_SHARE",
    value: REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Deceleration zone share outside [0,1] leads to malformed motion profile zones",
    predicate: inRangeInclusive(0, 1),
  },
  {
    layer: "Motion",
    field: "GO_TO_PREFLIGHT_PAGE_SPAN",
    value: GO_TO_PREFLIGHT_PAGE_SPAN,
    severity: "LOGICAL",
    expected: "Expected a positive finite integer (page screens)",
    consequence:
      "Far GO_TO teleport needs at least one animated preflight page before the cut",
    predicate: isPositiveInteger,
  },
  {
    layer: "Motion",
    field: "GO_TO_FINAL_APPROACH_PAGE_SPAN",
    value: GO_TO_FINAL_APPROACH_PAGE_SPAN,
    severity: "LOGICAL",
    expected: "Expected a positive finite integer (page screens)",
    consequence:
      "Far GO_TO needs at least one animated approach page after the teleport cut",
    predicate: isPositiveInteger,
  },
  {
    layer: "Motion",
    field: "GO_TO_TELEPORT_MIN_PAGE_SPAN",
    value: GO_TO_TELEPORT_MIN_PAGE_SPAN,
    severity: "CRITICAL",
    expected: `Expected a finite integer greater than GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN (${GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN})`,
    consequence:
      "A teleport whose span does not exceed preflight + approach skips a zero or negative middle — far GO_TO motion breaks",
    predicate: (v) =>
      isPositiveInteger(v) &&
      v > GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN,
  },
  {
    layer: "Motion",
    field: "GO_TO_ACCELERATION_DISTANCE_SHARE",
    value: GO_TO_ACCELERATION_DISTANCE_SHARE,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Acceleration zone share outside [0,1] leads to malformed GO_TO profile zones",
    predicate: inRangeInclusive(0, 1),
  },
  {
    layer: "Motion",
    field: "GO_TO_DECELERATION_DISTANCE_SHARE",
    value: GO_TO_DECELERATION_DISTANCE_SHARE,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Deceleration zone share outside [0,1] leads to malformed GO_TO profile zones",
    predicate: inRangeInclusive(0, 1),
  },
  // Duration-authored step profiles (click / autoplay / snap-back shapes)
  ...(
    [
      ["STEP_ACCELERATION_DISTANCE_SHARE", STEP_ACCELERATION_DISTANCE_SHARE],
      ["STEP_DECELERATION_DISTANCE_SHARE", STEP_DECELERATION_DISTANCE_SHARE],
      ["AUTOPLAY_ACCELERATION_DISTANCE_SHARE", AUTOPLAY_ACCELERATION_DISTANCE_SHARE],
      ["AUTOPLAY_DECELERATION_DISTANCE_SHARE", AUTOPLAY_DECELERATION_DISTANCE_SHARE],
      ["SNAP_BACK_ACCELERATION_DISTANCE_SHARE", SNAP_BACK_ACCELERATION_DISTANCE_SHARE],
      ["SNAP_BACK_DECELERATION_DISTANCE_SHARE", SNAP_BACK_DECELERATION_DISTANCE_SHARE],
    ] as Array<[string, number]>
  ).map(
    ([field, value]): NumericRule => ({
      layer: "Motion",
      field,
      value,
      severity: "CRITICAL",
      expected: "Expected a finite number in the range [0, 1]",
      consequence: "Profile zone share outside [0,1] leads to malformed motion profile zones",
      predicate: inRangeInclusive(0, 1),
    }),
  ),

  // Epsilons (must be small positive)
  {
    layer: "Motion",
    field: "MOTION_EPSILON",
    value: MOTION_EPSILON,
    severity: "CRITICAL",
    expected: "Expected a small positive finite number (e.g. 1e-4)",
    consequence: "Motion-runner sees the same logical state as a new segment and oscillates",
    predicate: greaterThan(0),
  },
  {
    layer: "Motion",
    field: "DRAG_RELEASE_EPSILON",
    value: DRAG_RELEASE_EPSILON,
    severity: "CRITICAL",
    expected: "Expected a small positive finite number (e.g. 1e-3)",
    consequence: "Drag release cannot identify 'already on target' and may animate trivially",
    predicate: greaterThan(0),
  },

  {
    layer: "Motion",
    field: "FALLBACK_WRITE_FRAME_SKIP",
    value: FALLBACK_WRITE_FRAME_SKIP,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite integer (values below 2 disable dropping)",
    consequence:
      "Legacy-fallback frame pacing becomes incoherent and track/widget writes desynchronize",
    predicate: isNonNegativeInteger,
  },

  // Layout
  {
    layer: "Layout",
    field: "RENDER_WINDOW_BUFFER_MULTIPLIER",
    value: RENDER_WINDOW_BUFFER_MULTIPLIER,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite integer",
    consequence: "Render window buffer collapses or oversizes, increasing churn or blank slides",
    predicate: isNonNegativeInteger,
  },
  {
    layer: "Slides",
    field: "IMAGE_RETRY_BASE_DELAY_MS",
    value: IMAGE_RETRY_BASE_DELAY_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Retry backoff starts from an invalid delay",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "IMAGE_RETRY_MAX_DELAY_MS",
    value: IMAGE_RETRY_MAX_DELAY_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Retry backoff clamps to an invalid delay",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "IMAGE_RETRY_MAX_ATTEMPTS",
    value: IMAGE_RETRY_MAX_ATTEMPTS,
    severity: "LOGICAL",
    expected: "Expected a positive finite integer",
    consequence: "Image retry cap becomes incoherent",
    predicate: isPositiveInteger,
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_FADE_OUT_MS",
    value: SLIDE_REORIENT_FADE_OUT_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Orientation-swap fade-out collapses to an instant blink or a negative transition",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_FADE_IN_MS",
    value: SLIDE_REORIENT_FADE_IN_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Orientation-swap fade-in collapses to an instant blink or a negative transition",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL_MAX_MS",
    value: SLIDE_REORIENT_VEIL_MAX_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence:
      "Orientation-swap veil either never fails open (images can stay hidden on a stalled network) or lifts before it can mask anything",
    predicate: greaterThan(0),
  },

  // Interaction
  {
    layer: "Interaction",
    field: "HOVER_PAUSE_DELAY",
    value: HOVER_PAUSE_DELAY,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of milliseconds",
    consequence: "setTimeout receives an invalid delay; hover-pause debounce becomes unreliable",
    predicate: atLeast(0),
  },
  {
    layer: "Interaction",
    field: "VISIBILITY_THRESHOLD",
    value: VISIBILITY_THRESHOLD,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "IntersectionObserver threshold outside (0,1] makes visibility detection break",
    predicate: inRangeExclusiveLower(0, 1),
  },

  // Gesture (swipe config)
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.cooldownMs",
    value: CAROUSEL_SWIPE_CONFIG.cooldownMs,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of milliseconds",
    consequence: "Negative or NaN cooldown leaves the gesture stuck or rapidly retriggering",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.flickVelocityAlpha",
    value: CAROUSEL_SWIPE_CONFIG.flickVelocityAlpha,
    severity: "LOGICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "Flick-memory EMA weight outside (0,1] makes the weighted-average gesture speed degenerate",
    predicate: inRangeExclusiveLower(0, 1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.flickPauseGraceMs",
    value: CAROUSEL_SWIPE_CONFIG.flickPauseGraceMs,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of milliseconds",
    consequence: "Lift-off grace window becomes incoherent",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.flickVelocityHalfLifeMs",
    value: CAROUSEL_SWIPE_CONFIG.flickVelocityHalfLifeMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Flick-memory decay either never decays or collapses instantly",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.catchDelayMs",
    value: CAROUSEL_SWIPE_CONFIG.catchDelayMs,
    severity: "LOGICAL",
    // The OS long-press sits near 500ms: a catch window at or beyond it lets
    // the context menu open BEFORE the strip is braked, so the menu would
    // describe a slide that is still riding away.
    expected:
      "Expected 0 <= catchDelayMs < 400ms (well below the OS long-press ~500ms)",
    consequence:
      "A press never brakes the strip before the long-press menu opens — the menu describes a slide that rides away",
    predicate: (value) => atLeast(0)(value) && value < 400,
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.intentThreshold",
    value: CAROUSEL_SWIPE_CONFIG.intentThreshold,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of pixels",
    consequence: "Drag intent detection becomes either too eager or never fires",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.resistance",
    value: CAROUSEL_SWIPE_CONFIG.resistance,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1)",
    consequence: "Edge resistance math produces NaN or infinite stiffness",
    predicate: inRangeExclusiveUpper(0, 1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.resistanceCurvature",
    value: CAROUSEL_SWIPE_CONFIG.resistanceCurvature,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number",
    consequence: "Resistance curvature outside [0, +inf) inverts overpull behaviour",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.maxVelocity",
    value: CAROUSEL_SWIPE_CONFIG.maxVelocity,
    severity: "CRITICAL",
    expected: "Expected a positive finite number (px/ms)",
    consequence: "Velocity clamp collapses to zero and release segments lose all inertia",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.emaAlpha",
    value: CAROUSEL_SWIPE_CONFIG.emaAlpha,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "EMA velocity filter divides by zero or never decays",
    predicate: inRangeExclusiveLower(0, 1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.quickFlickVelocity",
    value: CAROUSEL_SWIPE_CONFIG.quickFlickVelocity,
    severity: "LOGICAL",
    expected: "Expected a positive finite number (px/ms)",
    consequence: "Quick-flick detection cannot trigger and gestures must rely on distance only",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.quickFlickMinOffset",
    value: CAROUSEL_SWIPE_CONFIG.quickFlickMinOffset,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of pixels",
    consequence: "Quick-flick offset gate is invalid and gesture intent becomes inconsistent",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.minSwipeDistance",
    value: CAROUSEL_SWIPE_CONFIG.minSwipeDistance,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of pixels",
    consequence: "Minimum swipe distance is invalid; releases either snap back or always commit",
    predicate: atLeast(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.swipeThresholdRatio",
    value: CAROUSEL_SWIPE_CONFIG.swipeThresholdRatio,
    severity: "LOGICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "Distance-based commit threshold becomes impossible to reach or fires instantly",
    predicate: inRangeExclusiveLower(0, 1),
  },

  // Release config
  {
    layer: "Gesture",
    field: "SWIPE_COMMIT_SLOT_SHARE",
    value: SWIPE_COMMIT_SLOT_SHARE,
    severity: "LOGICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "Slot-relative commit share outside (0,1] makes the swipe threshold degenerate",
    predicate: inRangeExclusiveLower(0, 1),
  },
  {
    layer: "Gesture",
    field: "SWIPE_COMMIT_MIN_PX",
    value: SWIPE_COMMIT_MIN_PX,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of px",
    consequence: "Ergonomic floor for the commit distance becomes incoherent",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "SWIPE_COMMIT_MAX_PX",
    value: SWIPE_COMMIT_MAX_PX,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of px",
    consequence: "Ergonomic ceiling for the commit distance becomes incoherent",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "SWIPE_REFERENCE_SLOT_PX",
    value: SWIPE_REFERENCE_SLOT_PX,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of px",
    consequence: "Resistance-curvature rescaling loses its calibration anchor",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.inertiaBoost",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.inertiaBoost,
    severity: "LOGICAL",
    expected: "Expected a finite number >= 1 (1 = no boost; below 1 the multiplier DAMPS the flick)",
    consequence:
      "A flick's cruise intent falls below its own release speed — the boost is neutered (the continuity launch clamps cruise to the start speed) and fast swipes read as damped",
    predicate: atLeast(1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Continuity-launch ramp share outside [0,1] yields malformed release profiles",
    predicate: inRangeInclusive(0, 1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare,
    severity: "LOGICAL",
    expected:
      "Expected > 0 — the share IS the continuity-launch ramp (the path over which the ride accelerates from the visible lift-off speed to the cruise intent)",
    consequence:
      "Zero share switches the continuity launch OFF: the ride starts instantly at the cruise speed, restoring the velocity jump at lift-off the ramp exists to remove",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "GESTURE_COAST_MAX_MS",
    value: GESTURE_COAST_MAX_MS,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Coast-bridge fail-safe becomes incoherent (a stalled takeover could coast forever or never)",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.minRideDurationMs",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.minRideDurationMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Ride-duration floor becomes incoherent — flicks may collapse into teleports again",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.decelerationDistanceShare",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.decelerationDistanceShare,
    severity: "CRITICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Release deceleration share outside [0,1] yields negative or oversized durations",
    predicate: inRangeInclusive(0, 1),
  },
];

/**
 * Overallocated accel+decel shares (> 1) are normalized by the runtime
 * profile builder to equal halves with no cruise zone; report each pair that
 * triggers the normalization, with the shape runtime will actually use.
 */
const collectProfileShareRelation = (
  field: string,
  accelerationDistanceShare: number,
  decelerationDistanceShare: number,
  consequence: string,
  expected = "Expected accelerationShare + decelerationShare <= 1 for an explicit cruise zone",
): CarouselDiagnosticWarning | null => {
  const normalized = normalizeMotionProfileShares(
    accelerationDistanceShare,
    decelerationDistanceShare,
  );
  if (!normalized.wasNormalized) return null;
  return {
    severity: "LOGICAL",
    layer: "Motion",
    field,
    actual: {
      accelerationDistanceShare,
      decelerationDistanceShare,
      sum: accelerationDistanceShare + decelerationDistanceShare,
    },
    normalizedTo: {
      accelerationDistanceShare: normalized.accelerationShare,
      decelerationDistanceShare: normalized.decelerationShare,
      cruiseDistanceShare: normalized.cruiseShare,
    },
    expected,
    consequence,
  };
};

const collectReorientVeilRelation = (): CarouselDiagnosticWarning | null => {
  // The cap must leave room for a full fade OUT and back IN, otherwise the
  // fail-open lift truncates the mask mid-transition.
  const fullRoundTrip = SLIDE_REORIENT_FADE_OUT_MS + SLIDE_REORIENT_FADE_IN_MS;
  if (SLIDE_REORIENT_VEIL_MAX_MS >= fullRoundTrip) return null;
  return {
    severity: "LOGICAL",
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL_MAX_MS >= SLIDE_REORIENT_FADE_OUT_MS + SLIDE_REORIENT_FADE_IN_MS",
    actual: {
      fadeOutMs: SLIDE_REORIENT_FADE_OUT_MS,
      fadeInMs: SLIDE_REORIENT_FADE_IN_MS,
      veilMaxMs: SLIDE_REORIENT_VEIL_MAX_MS,
    },
    expected:
      "Expected the fail-open cap to cover a full fade out plus fade in",
    consequence:
      "The veil is force-lifted mid-transition: the stale-crop mask flashes instead of fading",
  };
};

const collectRideFloorRelation = (): CarouselDiagnosticWarning | null => {
  // The floor must stay well under the default step duration, otherwise a
  // flick stops being faster than an ordinary click step.
  if (CAROUSEL_INERTIAL_RELEASE_CONFIG.minRideDurationMs < CAROUSEL_DEFAULTS.durationStep) {
    return null;
  }
  return {
    severity: "LOGICAL",
    layer: "Gesture",
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.minRideDurationMs < CAROUSEL_DEFAULTS.durationStep",
    actual: {
      minRideDurationMs: CAROUSEL_INERTIAL_RELEASE_CONFIG.minRideDurationMs,
      defaultStepDurationMs: CAROUSEL_DEFAULTS.durationStep,
    },
    expected: "Expected the ride floor to stay below the default step duration",
    consequence: "A flick rides no faster than a plain click step — the gesture loses its snap",
  };
};

const collectSwipeCommitRelations = (): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];
  if (SWIPE_COMMIT_MIN_PX > SWIPE_COMMIT_MAX_PX) {
    out.push({
      severity: "LOGICAL",
      layer: "Gesture",
      field: "SWIPE_COMMIT_MIN_PX <= SWIPE_COMMIT_MAX_PX",
      actual: { minPx: SWIPE_COMMIT_MIN_PX, maxPx: SWIPE_COMMIT_MAX_PX },
      expected: "Expected the ergonomic floor not to exceed the ceiling",
      consequence: "The commit-distance clamp collapses to the ceiling for every slot",
    });
  }
  const atReference = SWIPE_COMMIT_SLOT_SHARE * SWIPE_REFERENCE_SLOT_PX;
  if (atReference < SWIPE_COMMIT_MIN_PX || atReference > SWIPE_COMMIT_MAX_PX) {
    out.push({
      severity: "LOGICAL",
      layer: "Gesture",
      field: "SWIPE_COMMIT_SLOT_SHARE * SWIPE_REFERENCE_SLOT_PX within [SWIPE_COMMIT_MIN_PX, SWIPE_COMMIT_MAX_PX]",
      actual: {
        commitAtReferencePx: atReference,
        minPx: SWIPE_COMMIT_MIN_PX,
        maxPx: SWIPE_COMMIT_MAX_PX,
      },
      expected:
        "Expected the commit distance at the calibration slot to land inside the ergonomic clamps",
      consequence:
        "The clamps override the intended share exactly where the feel was calibrated — the share constant becomes dead tuning",
    });
  }
  return out;
};

const collectRetryDelayRelation = (): CarouselDiagnosticWarning | null => {
  if (IMAGE_RETRY_MAX_DELAY_MS >= IMAGE_RETRY_BASE_DELAY_MS) return null;
  return {
    severity: "LOGICAL",
    layer: "Slides",
    field: "IMAGE_RETRY_MAX_DELAY_MS >= IMAGE_RETRY_BASE_DELAY_MS",
    actual: {
      baseDelayMs: IMAGE_RETRY_BASE_DELAY_MS,
      maxDelayMs: IMAGE_RETRY_MAX_DELAY_MS,
    },
    expected: "Expected max retry delay to be greater than or equal to the base delay",
    consequence: "Exponential backoff clamps below its own starting delay",
  };
};

/**
 * Audit every hand-written carousel constant used at runtime. The constants
 * are imported by value so the checks always see what the runtime sees.
 */
export const collectConstantWarnings = (): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];
  for (const rule of numericRules) {
    const warning = checkNumber(rule);
    if (warning) out.push(warning);
  }
  const profileRelations = [
    collectProfileShareRelation(
      "REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE + REPEATED_CLICK_DECELERATION_DISTANCE_SHARE",
      REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
      REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
      "Motion profile runtime normalizes overallocated shares to 50% acceleration and 50% deceleration",
    ),
    collectProfileShareRelation(
      "GO_TO_ACCELERATION_DISTANCE_SHARE + GO_TO_DECELERATION_DISTANCE_SHARE",
      GO_TO_ACCELERATION_DISTANCE_SHARE,
      GO_TO_DECELERATION_DISTANCE_SHARE,
      "A one-page direct GO_TO runtime profile normalizes overallocated local zones to 50% acceleration and 50% deceleration",
      "Expected accelerationShare + decelerationShare <= 1 for a one-page direct GO_TO",
    ),
    collectProfileShareRelation(
      "STEP_ACCELERATION_DISTANCE_SHARE + STEP_DECELERATION_DISTANCE_SHARE",
      STEP_ACCELERATION_DISTANCE_SHARE,
      STEP_DECELERATION_DISTANCE_SHARE,
      "Click-step runtime profile normalizes overallocated shares to 50% acceleration and 50% deceleration",
    ),
    collectProfileShareRelation(
      "AUTOPLAY_ACCELERATION_DISTANCE_SHARE + AUTOPLAY_DECELERATION_DISTANCE_SHARE",
      AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
      AUTOPLAY_DECELERATION_DISTANCE_SHARE,
      "Autoplay-step runtime profile normalizes overallocated shares to 50% acceleration and 50% deceleration",
    ),
collectProfileShareRelation(
      "CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare + decelerationDistanceShare",
      CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare,
      CAROUSEL_INERTIAL_RELEASE_CONFIG.decelerationDistanceShare,
      "Gesture-release runtime profile normalizes overallocated shares to 50% acceleration and 50% deceleration",
    ),
    collectProfileShareRelation(
      "SNAP_BACK_ACCELERATION_DISTANCE_SHARE + SNAP_BACK_DECELERATION_DISTANCE_SHARE",
      SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
      SNAP_BACK_DECELERATION_DISTANCE_SHARE,
      "Snap-back runtime profile normalizes overallocated shares to 50% acceleration and 50% deceleration",
    ),
  ];
  for (const relation of profileRelations) {
    if (relation) out.push(relation);
  }
  const retryDelayRelation = collectRetryDelayRelation();
  if (retryDelayRelation) out.push(retryDelayRelation);
  const reorientVeilRelation = collectReorientVeilRelation();
  if (reorientVeilRelation) out.push(reorientVeilRelation);
  out.push(...collectSwipeCommitRelations());
  const rideFloorRelation = collectRideFloorRelation();
  if (rideFloorRelation) out.push(rideFloorRelation);
  return out;
};
