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

/** Average speed magnitude: `|distance| / duration`. */
export const resolveSpeed = (distance: number, duration: number): number =>
  Math.abs(distance) / duration;

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

const POST_TELEPORT_CRUISE_PAGE_SPAN = 1;
const FINAL_APPROACH_PAGE_SPAN = 1;
const POST_TELEPORT_APPROACH_PAGE_SPAN =
  POST_TELEPORT_CRUISE_PAGE_SPAN + FINAL_APPROACH_PAGE_SPAN;

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

/**
 * GO_TO zones are local, not global:
 * - acceleration is measured only inside the first page screen;
 * - deceleration is measured only inside the final page screen;
 * - a far jump shows a configurable preflight, teleports the middle, then
 *   shows one full cruise page plus the final deceleration page.
 */
export const resolveGoToProfileZones = (
  stepSize: number,
  motion: MotionSettings,
): GoToProfileZones => ({
  accelerationDistance: stepSize * motion.goToAccelerationDistanceShare,
  decelerationDistance: stepSize * motion.goToDecelerationDistanceShare,
  preflightDistance: motion.goToPreflightPageSpan * stepSize,
  approachDistance: POST_TELEPORT_APPROACH_PAGE_SPAN * stepSize,
});

export interface GoToPlan {
  /** `true` when the span exceeds the bounded preflight + approach distance. */
  isTeleport: boolean;
  /**
   * Unsigned distance the first (preflight) - or, for a short jump, the only -
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
 * - Short jump: the whole real distance is animated; acceleration and
 *   deceleration stay local to the first and last page screens.
 * - Long jump: `goToPreflightPageSpan` page screens are animated before the
 *   teleport, the invisible middle is skipped, then one cruise page and the
 *   final deceleration page are animated.
 *
 * `pageSpan` is unsigned; the caller applies travel direction.
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

  if (realDistance <= visibleTeleportDistance) {
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

/**
 * Distance the post-teleport approach segment covers. Span-independent (it is
 * always one cruise page plus the final deceleration page), so the reducer can
 * resolve the approach origin at `MOTION_SETTLED` time without re-deriving the
 * full span.
 */
export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveGoToProfileZones(stepSize, motion).approachDistance;
