import type { MotionSettings } from "../config";

/**
 * GO_TO timing + geometry.
 *
 * This module is the single source of truth for how a GO_TO is laid out in
 * space. Both the reducer (`state/transitions.ts`, `state/reducer.ts`) and the
 * motion layer (`motion/segmentFactory.ts`) derive their numbers from here, so
 * the logical landing positions and the animated profile can never drift apart.
 *
 * It is a pure leaf module: no React, no controller, type-only config import.
 */

/**
 * Average speed magnitude: `|distance| / duration`. Returns `0` for a
 * non-positive duration rather than `Infinity`/`NaN` so a degenerate config
 * collapses to "no motion" instead of poisoning downstream math.
 */
export const resolveSpeed = (distance: number, duration: number): number =>
  duration > 0 ? Math.abs(distance) / duration : 0;

/**
 * Peak cruise speed of a GO_TO profile, expressed as a multiple of the normal
 * one-step MOVE speed. `jumpSpeedMultiplier` is the public knob; the duration
 * of any jump then falls out of distance / profile, so short and far jumps
 * keep one consistent cruise speed.
 */
export const resolveJumpPeakSpeed = (
  stepSize: number,
  stepDuration: number,
  jumpSpeedMultiplier: number,
): number => resolveSpeed(stepSize, stepDuration) * jumpSpeedMultiplier;

/**
 * Fraction of the cruise zone that is animated *before* the teleport. The
 * teleport is spliced at the cruise mid-point: half the cruise is shown on the
 * preflight side, half on the approach side. Splicing inside the cruise (a
 * constant-speed interval) is what keeps the teleport velocity-continuous.
 */
const TELEPORT_CRUISE_SPLIT = 0.5;

export interface TeleportZones {
  /** Distance actually animated on screen for any teleport (span-independent). */
  visibleDistance: number;
  /** Ramp-up zone length. Identical to a short jump's acceleration zone. */
  accelDistance: number;
  /** Constant-speed zone length; the teleport is spliced at its mid-point. */
  cruiseDistance: number;
  /** Ramp-down zone length. Identical to a short jump's deceleration zone. */
  decelDistance: number;
  /** Preflight travel: acceleration zone + first half of the cruise. */
  leadDistance: number;
  /** Approach travel: second half of the cruise + deceleration zone. */
  approachDistance: number;
}

/**
 * The canonical GO_TO profile, measured over the fixed visible distance a
 * teleport animates (`goToMaxAnimatedPageSpan` pages). Because this distance is
 * fixed, every long jump shares a byte-identical ramp-up and ramp-down; only
 * the invisible teleported middle differs.
 */
export const resolveTeleportZones = (
  stepSize: number,
  motion: MotionSettings,
): TeleportZones => {
  const visibleDistance = motion.goToMaxAnimatedPageSpan * stepSize;
  const accelDistance = visibleDistance * motion.goToAccelerationDistanceShare;
  const decelDistance = visibleDistance * motion.goToDecelerationDistanceShare;
  const cruiseDistance = visibleDistance - accelDistance - decelDistance;
  const leadDistance = accelDistance + cruiseDistance * TELEPORT_CRUISE_SPLIT;

  return {
    visibleDistance,
    accelDistance,
    cruiseDistance,
    decelDistance,
    leadDistance,
    approachDistance: visibleDistance - leadDistance,
  };
};

export interface GoToPlan {
  /** `true` when the span exceeds `goToMaxAnimatedPageSpan`. */
  isTeleport: boolean;
  /**
   * Unsigned distance the first (preflight) — or, for a short jump, the only —
   * animated segment covers.
   */
  leadDistance: number;
  /** Unsigned instantaneous position jump. `0` for a short jump. */
  teleportDistance: number;
  /** Unsigned distance the post-teleport approach segment covers. `0` short. */
  approachDistance: number;
}

/**
 * Lay out a GO_TO of `pageSpan` page screens.
 *
 * - Short jump (`pageSpan <= goToMaxAnimatedPageSpan`): the whole real distance
 *   is one animated lead segment, no teleport.
 * - Long jump: a bounded `leadDistance` is animated, `teleportDistance` is
 *   skipped instantly mid-cruise, then `approachDistance` is animated. The
 *   three always sum back to the real distance.
 *
 * `pageSpan` is unsigned; the caller applies travel direction.
 */
export const resolveGoToPlan = (
  pageSpan: number,
  stepSize: number,
  motion: MotionSettings,
): GoToPlan => {
  const realDistance = pageSpan * stepSize;

  if (pageSpan <= motion.goToMaxAnimatedPageSpan) {
    return {
      isTeleport: false,
      leadDistance: realDistance,
      teleportDistance: 0,
      approachDistance: 0,
    };
  }

  const zones = resolveTeleportZones(stepSize, motion);
  return {
    isTeleport: true,
    leadDistance: zones.leadDistance,
    teleportDistance: realDistance - zones.visibleDistance,
    approachDistance: zones.approachDistance,
  };
};

/**
 * Distance the post-teleport approach segment covers. Span-independent (it is
 * a slice of the fixed visible profile), so the reducer can resolve the
 * approach origin at `MOTION_SETTLED` time without re-deriving the full span.
 */
export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveTeleportZones(stepSize, motion).approachDistance;
