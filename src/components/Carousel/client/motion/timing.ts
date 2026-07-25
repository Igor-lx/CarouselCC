import type { MotionSettings } from "../config";

/**
 * GO_TO timing + geometry — the single source of truth for how a GO_TO is laid
 * out in space. Both the reducer and `motion/segmentFactory.ts` derive from
 * here, so logical landings and the animated profile cannot drift apart. Pure
 * leaf module (no React). See docs/architecture/motion.md.
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
 * direction). A jump flies only when both hold: intermediates (endpoints
 * excluded) `>= goToTeleportMinPageSpan`, AND at least one intermediate is
 * never shown (`intermediates > preflight + approach`) — teleporting between two
 * shown pages would be a pointless blink. The structural gate dominates, so a
 * knob below the floor merely fires idle (Diagnostics reports it).
 * `goToTeleportEnabled: false` short-circuits to a full continuous ride.
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
 * Duration of the post-teleport approach (computable before it exists): enters
 * at cruise, cruises, decays over the local decel budget. Zone times cruise
 * `(1-d)·A/p` + decel `2·d·A/p` = `A·(1+d)/p`. Lets the engine plan the total
 * far-GO_TO time up front, so a one-step consumer (the widget) runs it as one
 * motion.
 */
export const resolveGoToApproachDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
): number => {
  const zones = resolveGoToProfileZones(stepSize, motion);
  const approach = zones.approachDistance;
  if (!(approach > 0) || !(peakSpeed > 0)) return 0;
  // Ramp share trusted as authored — over-budget is a misconfiguration
  // Diagnostic reports, not one this math caps. Legit tuning cannot reach it.
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
  // Trusted as authored (see approach). Over-budget is sharper here: the
  // `(1 - accelShare)` cruise term goes negative and a fast entry can drive the
  // planned duration below zero — the visible failure Diagnostic reports.
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
 * Also the TIME CEILING of every continuous ride while the teleport is enabled
 * — a longer ride is compressed to this and cruises faster, so no jump is ever
 * slower than a farther one. Degenerate tunings yield `0` ("no ceiling").
 * Teleport disabled: no ceiling, duration grows with distance.
 */
export const resolveGoToFlightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number =>
  resolveGoToPreflightDuration(stepSize, motion, peakSpeed, startSpeed) +
  resolveGoToApproachDuration(stepSize, motion, peakSpeed);
