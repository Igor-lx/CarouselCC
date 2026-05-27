import { isFiniteNumber } from "../../../../../shared";
import {
  AUTOPLAY_PAGINATION_FACTOR,
  AUTO_BEZIER,
  CAROUSEL_INERTIAL_RELEASE_CONFIG,
  CAROUSEL_SWIPE_CONFIG,
  DRAG_RELEASE_EPSILON,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  HOVER_PAUSE_DELAY,
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
  IMAGE_RETRY_MAX_DELAY_MS,
  MOTION_EPSILON,
  MOVE_BEZIER,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  RENDER_WINDOW_BUFFER_MULTIPLIER,
  SNAP_BACK_BEZIER,
  SNAP_BACK_DURATION,
  VISIBILITY_THRESHOLD,
} from "../../../config";
import { isParsedBezierValid, parseBezier } from "../../../motion/bezier";
import { normalizeMotionProfileShares } from "../../../motion/profile";
import type { CarouselDiagnosticWarning } from "../types";

interface NumericRule {
  layer: string;
  field: string;
  value: number;
  expected: string;
  consequence: string;
  severity: CarouselDiagnosticWarning["severity"];
  predicate: (v: number) => boolean;
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

const inRangeInclusive = (min: number, max: number) => (v: number) =>
  v >= min && v <= max;
const inRangeExclusiveLower = (min: number, max: number) => (v: number) =>
  v > min && v <= max;
const inRangeExclusiveUpper = (min: number, max: number) => (v: number) =>
  v >= min && v < max;
const greaterThan = (min: number) => (v: number) => v > min;
const atLeast = (min: number) => (v: number) => v >= min;
const isNonNegativeInteger = (v: number) => v >= 0 && Number.isInteger(v);
const isPositiveInteger = (v: number) => v > 0 && Number.isInteger(v);

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
  {
    layer: "Interaction",
    field: "AUTOPLAY_PAGINATION_FACTOR",
    value: AUTOPLAY_PAGINATION_FACTOR,
    severity: "LOGICAL",
    expected: "Expected a finite number in the range [0, 1]",
    consequence: "Pagination dot delay for autoplay falls out of sync with the visual motion",
    predicate: inRangeInclusive(0, 1),
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
    field: "CAROUSEL_INERTIAL_RELEASE_CONFIG.inertiaBoost",
    value: CAROUSEL_INERTIAL_RELEASE_CONFIG.inertiaBoost,
    severity: "LOGICAL",
    expected: "Expected a positive finite number",
    consequence: "Release boost becomes zero or negative and high-velocity releases lose inertia",
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

const collectBezierWarnings = (): CarouselDiagnosticWarning[] => {
  const entries: Array<[string, string]> = [
    ["MOVE_BEZIER", MOVE_BEZIER],
    ["AUTO_BEZIER", AUTO_BEZIER],
    ["SNAP_BACK_BEZIER", SNAP_BACK_BEZIER],
  ];
  const out: CarouselDiagnosticWarning[] = [];
  for (const [field, raw] of entries) {
    const parsed = parseBezier(raw);
    if (isParsedBezierValid(parsed)) continue;
    out.push({
      severity: "CRITICAL",
      layer: "Motion",
      field,
      actual: raw,
      expected: 'Expected a valid CSS cubic-bezier(x1, y1, x2, y2) or "linear" string',
      consequence:
        "Bezier sampler produces NaN, motion progresses to NaN and the track transform is invalid",
    });
  }
  return out;
};

const collectRepeatedShareRelation = (): CarouselDiagnosticWarning | null => {
  const accelerationDistanceShare = REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE;
  const decelerationDistanceShare = REPEATED_CLICK_DECELERATION_DISTANCE_SHARE;
  const normalized = normalizeMotionProfileShares(
    accelerationDistanceShare,
    decelerationDistanceShare,
  );
  const sum =
    REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE +
    REPEATED_CLICK_DECELERATION_DISTANCE_SHARE;
  if (!normalized.wasNormalized) return null;
  return {
    severity: "LOGICAL",
    layer: "Motion",
    field: "REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE + REPEATED_CLICK_DECELERATION_DISTANCE_SHARE",
    actual: {
      accelerationDistanceShare,
      decelerationDistanceShare,
      sum,
    },
    normalizedTo: {
      accelerationDistanceShare: normalized.accelerationShare,
      decelerationDistanceShare: normalized.decelerationShare,
      cruiseDistanceShare: normalized.cruiseShare,
    },
    expected: "Expected accelerationShare + decelerationShare <= 1 for an explicit cruise zone",
    consequence:
      "Motion profile runtime normalizes overallocated shares to 50% acceleration and 50% deceleration",
  };
};

const collectGoToShareRelation = (): CarouselDiagnosticWarning | null => {
  const accelerationDistanceShare = GO_TO_ACCELERATION_DISTANCE_SHARE;
  const decelerationDistanceShare = GO_TO_DECELERATION_DISTANCE_SHARE;
  const normalized = normalizeMotionProfileShares(
    accelerationDistanceShare,
    decelerationDistanceShare,
  );
  const sum = accelerationDistanceShare + decelerationDistanceShare;
  if (!normalized.wasNormalized) return null;

  return {
    severity: "LOGICAL",
    layer: "Motion",
    field: "GO_TO_ACCELERATION_DISTANCE_SHARE + GO_TO_DECELERATION_DISTANCE_SHARE",
    actual: {
      accelerationDistanceShare,
      decelerationDistanceShare,
      sum,
    },
    normalizedTo: {
      accelerationDistanceShare: normalized.accelerationShare,
      decelerationDistanceShare: normalized.decelerationShare,
      cruiseDistanceShare: normalized.cruiseShare,
    },
    expected:
      "Expected accelerationShare + decelerationShare <= 1 for a one-page direct GO_TO",
    consequence:
      "A one-page direct GO_TO runtime profile normalizes overallocated local zones to 50% acceleration and 50% deceleration",
  };
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
  const sumRelation = collectRepeatedShareRelation();
  if (sumRelation) out.push(sumRelation);
  const goToShareRelation = collectGoToShareRelation();
  if (goToShareRelation) out.push(goToShareRelation);
  const retryDelayRelation = collectRetryDelayRelation();
  if (retryDelayRelation) out.push(retryDelayRelation);
  out.push(...collectBezierWarnings());
  return out;
};
