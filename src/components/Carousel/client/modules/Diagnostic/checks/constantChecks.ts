// See docs/architecture/diagnostics.md
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

  FALLBACK_DROP_EVERY_NTH_FRAME,

  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_SPEED_MULTIPLIER,
  GO_TO_TELEPORT_ENABLED,
  GO_TO_TELEPORT_MIN_PAGE_SPAN,
  IMAGE_RETRY,
  PAUSE_HOVER_DELAY_MS,
  PAUSE_VISIBILITY_RATIO,
  SLIDE_REORIENT_VEIL,

  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  RENDER_WINDOW_BUFFER_MULTIPLIER,
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
  SNAP_BACK_DURATION_MS,
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
  AUTOPLAY_RESETTLE_DELAY_MS,
  REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES,
} from "../../../config";
// Implementation constants imported from their subsystem homes (audited here).
import { MOTION_EPSILON } from "../../../motion/tolerances";
import { DRAG_RELEASE_EPSILON } from "../../../domain/dragRelease";
import { GESTURE_COAST_MAX_MS } from "../../../gesture/coast";
import { SWIPE_REFERENCE_SLOT_PX } from "../../../gesture/slotAdaptiveSwipe";
import type { CarouselDiagnosticWarning } from "../types";

interface NumericRule {
  layer: string;
  field: string;
  value: number;
  expected: string;
  consequence: string;
  severity: CarouselDiagnosticWarning["severity"];
  /** Shared numeric guard (see `shared/math`); implies finiteness. */
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

// Built on demand, not at module scope: a module-level const would be an
// impure top-level side effect that survives tree-shaking into production.
const buildNumericRules = (): NumericRule[] => [
  // Motion timings / factors
  {
    layer: "Motion",
    field: "SNAP_BACK_DURATION_MS",
    value: SNAP_BACK_DURATION_MS,
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
    expected: "Expected a positive finite integer (intermediate pages)",
    consequence:
      "The teleport threshold cannot be compared against a page count and far GO_TO behaviour is unpredictable",
    predicate: isPositiveInteger,
  },
  {
    layer: "Motion",
    field: "GO_TO_TELEPORT_MIN_PAGE_SPAN",
    value: GO_TO_TELEPORT_MIN_PAGE_SPAN,
    severity: "LOGICAL",
    expected: `Expected >= GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN + 1 (${GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN + 1}) — below that no intermediate page can ever be skipped`,
    consequence:
      "The knob fires idle: the structural gate (at least one fully skipped page) dominates and every jump rides continuously as if the threshold were the floor",
    predicate: (v) =>
      typeof v === "number" &&
      v >= GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN + 1,
  },
  {
    layer: "Motion",
    field: "GO_TO_SPEED_MULTIPLIER",
    value: GO_TO_SPEED_MULTIPLIER,
    severity: "CRITICAL",
    expected: "Expected a positive finite number",
    consequence:
      "GO_TO peak speed becomes zero, negative or NaN and far jumps freeze or break",
    predicate: greaterThan(0),
  },
  {
    layer: "Motion",
    field: "GO_TO_SPEED_MULTIPLIER",
    value: GO_TO_SPEED_MULTIPLIER,
    severity: "LOGICAL",
    expected: "Expected a finite number >= 1 (a jump at least as fast as a step)",
    consequence:
      "A GO_TO slower than a single step inverts the visual contract and feels wrong",
    predicate: atLeast(1),
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
    field: "FALLBACK_DROP_EVERY_NTH_FRAME",
    value: FALLBACK_DROP_EVERY_NTH_FRAME,
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
    field: "IMAGE_RETRY.baseDelayMs",
    value: IMAGE_RETRY.baseDelayMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Retry backoff starts from an invalid delay",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "IMAGE_RETRY.maxDelayMs",
    value: IMAGE_RETRY.maxDelayMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Retry backoff clamps to an invalid delay",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "IMAGE_RETRY.maxAttempts",
    value: IMAGE_RETRY.maxAttempts,
    severity: "LOGICAL",
    expected: "Expected a positive finite integer",
    consequence: "Image retry cap becomes incoherent",
    predicate: isPositiveInteger,
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL.fadeOutMs",
    value: SLIDE_REORIENT_VEIL.fadeOutMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Orientation-swap fade-out collapses to an instant blink or a negative transition",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL.fadeInMs",
    value: SLIDE_REORIENT_VEIL.fadeInMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence: "Orientation-swap fade-in collapses to an instant blink or a negative transition",
    predicate: greaterThan(0),
  },
  {
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL.veilMaxMs",
    value: SLIDE_REORIENT_VEIL.veilMaxMs,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of milliseconds",
    consequence:
      "Orientation-swap veil either never fails open (images can stay hidden on a stalled network) or lifts before it can mask anything",
    predicate: greaterThan(0),
  },

  // Interaction
  {
    layer: "Interaction",
    field: "PAUSE_HOVER_DELAY_MS",
    value: PAUSE_HOVER_DELAY_MS,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of milliseconds",
    consequence: "setTimeout receives an invalid delay; hover-pause debounce becomes unreliable",
    predicate: atLeast(0),
  },
  {
    layer: "Interaction",
    field: "REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES",
    value: REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES,
    severity: "CRITICAL",
    expected: "Expected a positive finite integer (pages)",
    consequence:
      "A repeated click resolves to a non-page landing and the reducer clamp math breaks",
    predicate: isPositiveInteger,
  },
  {
    layer: "Interaction",
    field: "REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES",
    value: REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES,
    severity: "LOGICAL",
    expected: `Expected <= RENDER_WINDOW_BUFFER_MULTIPLIER (${RENDER_WINDOW_BUFFER_MULTIPLIER}) — the render window must pre-mount everything a repeated click can reveal`,
    consequence:
      "A repeated click mounts new slides into the MOVING track layer — a commit+raster hitch exactly at motion start",
    predicate: (v) =>
      typeof v === "number" && v <= RENDER_WINDOW_BUFFER_MULTIPLIER,
  },
  {
    layer: "Interaction",
    field: "AUTOPLAY_RESETTLE_DELAY_MS",
    value: AUTOPLAY_RESETTLE_DELAY_MS,
    severity: "LOGICAL",
    expected: "Expected a non-negative finite number of milliseconds",
    consequence:
      "Autoplay would tick into the browser-chrome settle window, where weak GPUs miss the presentation latch and rides visibly bounce",
    predicate: atLeast(0),
  },
  {
    layer: "Interaction",
    field: "PAUSE_VISIBILITY_RATIO",
    value: PAUSE_VISIBILITY_RATIO,
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
    field: "CAROUSEL_SWIPE_CONFIG.commit.slotShare",
    value: CAROUSEL_SWIPE_CONFIG.commit.slotShare,
    severity: "LOGICAL",
    expected: "Expected a finite number in the range (0, 1]",
    consequence: "Slot-relative commit share outside (0,1] makes the swipe threshold degenerate",
    predicate: inRangeExclusiveLower(0, 1),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.commit.minPx",
    value: CAROUSEL_SWIPE_CONFIG.commit.minPx,
    severity: "LOGICAL",
    expected: "Expected a positive finite number of px",
    consequence: "Ergonomic floor for the commit distance becomes incoherent",
    predicate: greaterThan(0),
  },
  {
    layer: "Gesture",
    field: "CAROUSEL_SWIPE_CONFIG.commit.maxPx",
    value: CAROUSEL_SWIPE_CONFIG.commit.maxPx,
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

// Over-allocated accel+decel (> 1) is trusted by the engine, not rescued —
// report every pair (ADR-002).
const collectProfileShareRelation = (
  field: string,
  accelerationDistanceShare: number,
  decelerationDistanceShare: number,
  expected = "Expected accelerationShare + decelerationShare <= 1 for an explicit cruise zone",
): CarouselDiagnosticWarning | null => {
  const sum = accelerationDistanceShare + decelerationDistanceShare;
  if (!(Number.isFinite(sum) && sum > 1)) return null;
  return {
    severity: "LOGICAL",
    layer: "Motion",
    field,
    actual: {
      accelerationDistanceShare,
      decelerationDistanceShare,
      sum,
    },
    expected,
    consequence:
      "The engine uses these shares as-is: with no cruise budget the ramps over-fill the distance, so the ride finishes its travel before its nominal duration and holds at the destination for the remainder (and the duration<->peak solve degenerates)",
  };
};

const collectReorientVeilRelation = (): CarouselDiagnosticWarning | null => {
  // The cap must cover a full fade out + in, else the fail-open truncates it.
  const fullRoundTrip =
    SLIDE_REORIENT_VEIL.fadeOutMs + SLIDE_REORIENT_VEIL.fadeInMs;
  if (SLIDE_REORIENT_VEIL.veilMaxMs >= fullRoundTrip) return null;
  return {
    severity: "LOGICAL",
    layer: "Slides",
    field: "SLIDE_REORIENT_VEIL.veilMaxMs >= .fadeOutMs + .fadeInMs",
    actual: {
      fadeOutMs: SLIDE_REORIENT_VEIL.fadeOutMs,
      fadeInMs: SLIDE_REORIENT_VEIL.fadeInMs,
      veilMaxMs: SLIDE_REORIENT_VEIL.veilMaxMs,
    },
    expected:
      "Expected the fail-open cap to cover a full fade out plus fade in",
    consequence:
      "The veil is force-lifted mid-transition: the stale-crop mask flashes instead of fading",
  };
};

const collectRideFloorRelation = (): CarouselDiagnosticWarning | null => {
  // The floor must stay under the default step, else a flick isn't faster.
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
  const { slotShare, minPx, maxPx } = CAROUSEL_SWIPE_CONFIG.commit;
  if (minPx > maxPx) {
    out.push({
      severity: "LOGICAL",
      layer: "Gesture",
      field: "CAROUSEL_SWIPE_CONFIG.commit.minPx <= .maxPx",
      actual: { minPx, maxPx },
      expected: "Expected the ergonomic floor not to exceed the ceiling",
      consequence: "The commit-distance clamp collapses to the ceiling for every slot",
    });
  }
  const atReference = slotShare * SWIPE_REFERENCE_SLOT_PX;
  if (atReference < minPx || atReference > maxPx) {
    out.push({
      severity: "LOGICAL",
      layer: "Gesture",
      field: "CAROUSEL_SWIPE_CONFIG.commit.slotShare * SWIPE_REFERENCE_SLOT_PX within [minPx, maxPx]",
      actual: {
        commitAtReferencePx: atReference,
        minPx,
        maxPx,
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
  if (IMAGE_RETRY.maxDelayMs >= IMAGE_RETRY.baseDelayMs) return null;
  return {
    severity: "LOGICAL",
    layer: "Slides",
    field: "IMAGE_RETRY.maxDelayMs >= .baseDelayMs",
    actual: {
      baseDelayMs: IMAGE_RETRY.baseDelayMs,
      maxDelayMs: IMAGE_RETRY.maxDelayMs,
    },
    expected: "Expected max retry delay to be greater than or equal to the base delay",
    consequence: "Exponential backoff clamps below its own starting delay",
  };
};

// The only boolean knob — a dedicated check the numeric rules cannot cover.
const collectTeleportEnabledType = (): CarouselDiagnosticWarning | null => {
  if (typeof GO_TO_TELEPORT_ENABLED === "boolean") return null;
  return {
    severity: "CRITICAL",
    layer: "Motion",
    field: "GO_TO_TELEPORT_ENABLED",
    actual: GO_TO_TELEPORT_ENABLED,
    expected: "Expected a literal boolean",
    consequence:
      "The teleport gate coerces a non-boolean and far GO_TO behaviour becomes accidental",
  };
};

/** Warn threshold of the check below (not a tuning knob). */
const TRANSITION_ZONE_CRUISE_WARN_FACTOR = 2;

// A too-high teleport gate widens the time-capped transition zone until rides
// just below it visibly outrun the nominal jump speed (distance estimate).
const collectTeleportTransitionZoneRelation =
  (): CarouselDiagnosticWarning | null => {
    if (GO_TO_TELEPORT_ENABLED !== true) return null;
    const shownPages =
      GO_TO_PREFLIGHT_PAGE_SPAN + GO_TO_FINAL_APPROACH_PAGE_SPAN;
    const rampPages =
      GO_TO_ACCELERATION_DISTANCE_SHARE + GO_TO_DECELERATION_DISTANCE_SHARE;
    if (!(shownPages + rampPages > 0)) return null;
    const widestRidePages =
      Math.max(GO_TO_TELEPORT_MIN_PAGE_SPAN - 1, shownPages) + 1;
    const compressionFactor =
      (widestRidePages + rampPages) / (shownPages + rampPages);
    if (compressionFactor <= TRANSITION_ZONE_CRUISE_WARN_FACTOR) return null;
    return {
      severity: "LOGICAL",
      layer: "Motion",
      field: "GO_TO_TELEPORT_MIN_PAGE_SPAN",
      actual: GO_TO_TELEPORT_MIN_PAGE_SPAN,
      expected: `Expected the widest still-riding jump to need at most ${TRANSITION_ZONE_CRUISE_WARN_FACTOR}x the shared GO_TO cruise (got ~${compressionFactor.toFixed(2)}x)`,
      consequence:
        "Rides just below the teleport gate are time-capped to the flight envelope and cruise much faster than the nominal jump speed — the transition zone reads as a blur",
    };
  };

// A GO_TO ramp share wider than its page span makes the local ramp claim more
// than the whole segment — trusted, not clamped, so reported.
const collectGoToRampBudgetRelations = (): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];

  if (GO_TO_ACCELERATION_DISTANCE_SHARE > GO_TO_PREFLIGHT_PAGE_SPAN) {
    out.push({
      severity: "LOGICAL",
      layer: "Motion",
      field: "GO_TO_ACCELERATION_DISTANCE_SHARE <= GO_TO_PREFLIGHT_PAGE_SPAN",
      actual: {
        accelerationDistanceShare: GO_TO_ACCELERATION_DISTANCE_SHARE,
        preflightPageSpan: GO_TO_PREFLIGHT_PAGE_SPAN,
        localAccelerationShare:
          GO_TO_ACCELERATION_DISTANCE_SHARE / GO_TO_PREFLIGHT_PAGE_SPAN,
      },
      expected:
        "Expected the acceleration budget to fit inside the preflight span",
      consequence:
        "The preflight ramp claims more than the whole preflight: its cruise term goes negative and a fast entry can drive the planned preflight duration below zero",
    });
  }

  if (GO_TO_DECELERATION_DISTANCE_SHARE > GO_TO_FINAL_APPROACH_PAGE_SPAN) {
    out.push({
      severity: "LOGICAL",
      layer: "Motion",
      field: "GO_TO_DECELERATION_DISTANCE_SHARE <= GO_TO_FINAL_APPROACH_PAGE_SPAN",
      actual: {
        decelerationDistanceShare: GO_TO_DECELERATION_DISTANCE_SHARE,
        finalApproachPageSpan: GO_TO_FINAL_APPROACH_PAGE_SPAN,
        localDecelerationShare:
          GO_TO_DECELERATION_DISTANCE_SHARE / GO_TO_FINAL_APPROACH_PAGE_SPAN,
      },
      expected:
        "Expected the deceleration budget to fit inside the final-approach span",
      consequence:
        "The approach ramp claims more than the whole approach, stretching the planned approach duration past its intended envelope",
    });
  }

  return out;
};

/** Audit every hand-written runtime constant (imported by value). */
export const collectConstantWarnings = (): CarouselDiagnosticWarning[] => {
  const out: CarouselDiagnosticWarning[] = [];
  for (const rule of buildNumericRules()) {
    const warning = checkNumber(rule);
    if (warning) out.push(warning);
  }
  const profileRelations = [
    collectProfileShareRelation(
      "REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE + REPEATED_CLICK_DECELERATION_DISTANCE_SHARE",
      REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
      REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
    ),
    collectProfileShareRelation(
      "GO_TO_ACCELERATION_DISTANCE_SHARE + GO_TO_DECELERATION_DISTANCE_SHARE",
      GO_TO_ACCELERATION_DISTANCE_SHARE,
      GO_TO_DECELERATION_DISTANCE_SHARE,
      "Expected accelerationShare + decelerationShare <= 1 for a one-page direct GO_TO",
    ),
    collectProfileShareRelation(
      "STEP_ACCELERATION_DISTANCE_SHARE + STEP_DECELERATION_DISTANCE_SHARE",
      STEP_ACCELERATION_DISTANCE_SHARE,
      STEP_DECELERATION_DISTANCE_SHARE,
    ),
    collectProfileShareRelation(
      "AUTOPLAY_ACCELERATION_DISTANCE_SHARE + AUTOPLAY_DECELERATION_DISTANCE_SHARE",
      AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
      AUTOPLAY_DECELERATION_DISTANCE_SHARE,
    ),
    collectProfileShareRelation(
      "CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare + decelerationDistanceShare",
      CAROUSEL_INERTIAL_RELEASE_CONFIG.accelerationDistanceShare,
      CAROUSEL_INERTIAL_RELEASE_CONFIG.decelerationDistanceShare,
    ),
    collectProfileShareRelation(
      "SNAP_BACK_ACCELERATION_DISTANCE_SHARE + SNAP_BACK_DECELERATION_DISTANCE_SHARE",
      SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
      SNAP_BACK_DECELERATION_DISTANCE_SHARE,
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
  const teleportEnabledType = collectTeleportEnabledType();
  if (teleportEnabledType) out.push(teleportEnabledType);
  const teleportTransitionZone = collectTeleportTransitionZoneRelation();
  if (teleportTransitionZone) out.push(teleportTransitionZone);
  out.push(...collectGoToRampBudgetRelations());
  return out;
};
