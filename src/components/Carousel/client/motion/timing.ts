import type { MotionSettings } from "../config";

/**
 * GO_TO timing + geometry — the single source of truth for how a GO_TO is laid
 * out in space. The reducer and `segmentFactory.ts` both derive from here, so
 * logical landings and the animated profile cannot drift apart.
 * See docs/architecture/motion.md.
 */

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

/** Accel/decel are LOCAL (first/final page screen); a far jump shows preflight,
 * teleports the middle, then shows the approach page. */
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

/**
 * Lay out a GO_TO of `pageSpan` page screens (unsigned; caller applies
 * direction). A jump flies only when both hold: intermediates
 * `>= goToTeleportMinPageSpan`, AND at least one is never shown
 * (`intermediates > preflight + approach`) — else a teleport is a pointless
 * blink. `goToTeleportEnabled: false` short-circuits to a continuous ride.
 * See docs/architecture/motion.md.
 */
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

/** Distance the post-teleport approach covers — span-independent, so the
 * reducer can resolve the approach origin at MOTION_SETTLED without the span. */
export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveGoToProfileZones(stepSize, motion).approachDistance;

/**
 * Duration of the post-teleport approach, computable before it exists: cruise
 * `(1-d)·A/p` + decel `2·d·A/p` = `A·(1+d)/p`. Lets the engine plan the total
 * far-GO_TO time up front, so a one-step consumer runs it as one motion.
 */
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

/**
 * Duration of the pre-teleport preflight: enter at `startSpeed`, accelerate to
 * cruise over the local accel budget, cruise the rest. Zone times accel
 * `2·a·P/(s+p)` + cruise `(1-a)·P/p`. Mirror of the approach.
 */
export const resolveGoToPreflightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number => {
  const zones = resolveGoToProfileZones(stepSize, motion);
  const preflight = zones.preflightDistance;
  if (!(preflight > 0) || !(peakSpeed > 0)) return 0;
  // Trusted as authored (see approach). Over-budget bites harder here: the
  // `(1 - accelShare)` cruise term goes negative — the failure Diagnostic reports.
  const accelShare = zones.accelerationDistance / preflight;
  const entrySpeed = Math.max(0, startSpeed);
  const accelDistance = accelShare * preflight;
  return (
    (2 * accelDistance) / (entrySpeed + peakSpeed) +
    ((1 - accelShare) * preflight) / peakSpeed
  );
};

/**
 * Total animated time of a flight (preflight + approach; the cut is instant).
 * Also the TIME CEILING of every continuous ride while teleport is enabled — a
 * longer ride is compressed to this so no jump is ever slower than a farther
 * one. Degenerate tunings yield `0` ("no ceiling").
 */
export const resolveGoToFlightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number =>
  resolveGoToPreflightDuration(stepSize, motion, peakSpeed, startSpeed) +
  resolveGoToApproachDuration(stepSize, motion, peakSpeed);
