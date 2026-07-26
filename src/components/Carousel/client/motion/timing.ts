// GO_TO timing + geometry — the single source of truth both the reducer and
// segmentFactory derive from, so landings and profile can't drift.
// See docs/architecture/motion.md
import type { MotionSettings } from "../config";

/** Average speed magnitude: `|distance| / duration`. */
export const resolveSpeed = (distance: number, duration: number): number =>
  Math.abs(distance) / duration;

/** GO_TO peak cruise speed = normal step speed × `goToSpeedMultiplier`. */
export const resolveJumpPeakSpeed = (
  stepSize: number,
  stepDuration: number,
  goToSpeedMultiplier: number,
): number => resolveSpeed(stepSize, stepDuration) * goToSpeedMultiplier;

export interface GoToProfileZones {
  /** Acceleration distance, local to the first page screen of any GO_TO. */
  accelerationDistance: number;
  /** Deceleration distance, local to the final page screen of any GO_TO. */
  decelerationDistance: number;
  /** Distance animated before a far-GO_TO teleport. */
  preflightDistance: number;
  /** Fixed distance animated after a far-GO_TO teleport. */
  approachDistance: number;
}

export const resolveGoToProfileZones = (
  stepSize: number,
  motion: MotionSettings,
): GoToProfileZones => ({
  accelerationDistance: stepSize * motion.goToAccelerationDistanceShare,
  decelerationDistance: stepSize * motion.goToDecelerationDistanceShare,
  preflightDistance: motion.goToPreflightPageSpan * stepSize,
  approachDistance: motion.goToFinalApproachPageSpan * stepSize,
});

export interface GoToPlan {
  /** `true` when the span exceeds the bounded preflight + approach distance. */
  isTeleport: boolean;
  /** Unsigned distance the preflight (or, for a short jump, the only) segment covers. */
  leadDistance: number;
  /** Unsigned instantaneous position jump. `0` for a short jump. */
  teleportDistance: number;
  /** Unsigned distance the post-teleport approach covers. `0` for a short jump. */
  approachDistance: number;
}

// Flies only when intermediates >= min AND at least one is never shown; else a
// teleport is a pointless blink (see motion.md).
export const resolveGoToPlan = (
  pageSpan: number,
  stepSize: number,
  motion: MotionSettings,
): GoToPlan => {
  const realDistance = pageSpan * stepSize;
  const zones = resolveGoToProfileZones(stepSize, motion);
  const visibleTeleportDistance =
    zones.preflightDistance + zones.approachDistance;

  const intermediatePages = pageSpan - 1;
  const shownIntermediates =
    motion.goToPreflightPageSpan + motion.goToFinalApproachPageSpan;
  const hasSkippablePage = intermediatePages > shownIntermediates;

  if (
    !motion.goToTeleportEnabled ||
    intermediatePages < motion.goToTeleportMinPageSpan ||
    !hasSkippablePage
  ) {
    return {
      isTeleport: false,
      leadDistance: realDistance,
      teleportDistance: 0,
      approachDistance: 0,
    };
  }

  return {
    isTeleport: true,
    leadDistance: zones.preflightDistance,
    teleportDistance: realDistance - visibleTeleportDistance,
    approachDistance: zones.approachDistance,
  };
};

/** Span-independent, so the reducer resolves the approach origin without the span. */
export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveGoToProfileZones(stepSize, motion).approachDistance;

/** Approach duration = `A·(1+d)/p` (cruise + local decel). */
export const resolveGoToApproachDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
): number => {
  const zones = resolveGoToProfileZones(stepSize, motion);
  const approach = zones.approachDistance;
  if (!(approach > 0) || !(peakSpeed > 0)) return 0;
  // Ramp share trusted as authored — over-budget is a Diagnostic, not a cap.
  const decelShare = zones.decelerationDistance / approach;
  return (approach * (1 + decelShare)) / peakSpeed;
};

/** Preflight duration = accel `2·a·P/(s+p)` + cruise `(1-a)·P/p`. Mirror of the approach. */
export const resolveGoToPreflightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number => {
  const zones = resolveGoToProfileZones(stepSize, motion);
  const preflight = zones.preflightDistance;
  if (!(preflight > 0) || !(peakSpeed > 0)) return 0;
  // Over-budget bites harder here: the cruise term goes negative (a Diagnostic).
  const accelShare = zones.accelerationDistance / preflight;
  const entrySpeed = Math.max(0, startSpeed);
  const accelDistance = accelShare * preflight;
  return (
    (2 * accelDistance) / (entrySpeed + peakSpeed) +
    ((1 - accelShare) * preflight) / peakSpeed
  );
};

/** Total flight time (preflight + approach) — also the ceiling for continuous
 * rides; `0` means no ceiling (see motion.md). */
export const resolveGoToFlightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number =>
  resolveGoToPreflightDuration(stepSize, motion, peakSpeed, startSpeed) +
  resolveGoToApproachDuration(stepSize, motion, peakSpeed);
