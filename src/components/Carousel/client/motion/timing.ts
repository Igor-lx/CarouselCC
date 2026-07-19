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
 * one-step MOVE speed. `goToSpeedMultiplier` is the tuning knob (see
 * GO_TO_SPEED_MULTIPLIER); the duration of any jump then falls out of
 * distance / profile, so short and far jumps keep one consistent cruise speed.
 */
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

/**
 * GO_TO zones are local, not global:
 * - acceleration is measured only inside the first page screen;
 * - deceleration is measured only inside the final page screen;
 * - a far jump shows a configurable preflight, teleports the middle, then
 *   shows the final approach page.
 */
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
 * Teleport semantics: `goToTeleportMinPageSpan` counts INTERMEDIATE pages —
 * the pages strictly between the start page and the target page (neither
 * endpoint included). A jump FLIES only when BOTH hold:
 *
 *  1. `intermediates >= goToTeleportMinPageSpan` — the knob's threshold;
 *  2. at least ONE intermediate page would never be shown at all:
 *     preflight shows `preflightPageSpan` of them and the approach shows
 *     `finalApproachPageSpan`, so a full page is skipped only when
 *     `intermediates > preflight + approach`. Teleporting between two pages
 *     that are BOTH shown anyway (the old behaviour at the minimum span) is
 *     a pointless blink — the deck just rides continuously instead.
 *
 * The structural gate (2) dominates: a knob set below the floor
 * (`preflight + approach + 1`) never breaks anything — every jump simply
 * rides — it merely fires idle, and Diagnostics reports that.
 *
 * `goToTeleportEnabled: false` short-circuits everything: no jump ever
 * flies (and no ride is ever time-capped — see the flight envelope below),
 * every GO_TO rides the full distance at the shared cruise speed.
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

/**
 * Distance the post-teleport approach segment covers. Span-independent (it is
 * always the final approach page), so the reducer can resolve the approach
 * origin at `MOTION_SETTLED` time without re-deriving the full span.
 */
export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveGoToProfileZones(stepSize, motion).approachDistance;

/**
 * Duration of the post-teleport approach segment, computable BEFORE the
 * approach exists: it always enters at the jump cruise speed, cruises, then
 * decays over the local deceleration budget. Zone times: cruise
 * `(1-d)·A/p` plus deceleration `2·d·A/p` (average speed `p/2`), i.e.
 * `A·(1+d)/p`. Lets the engine plan the TOTAL far-GO_TO time at preflight
 * start, so a one-step consumer (the pagination widget) can run the whole
 * command as a single motion.
 */
export const resolveGoToApproachDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
): number => {
  const zones = resolveGoToProfileZones(stepSize, motion);
  const approach = zones.approachDistance;
  if (!(approach > 0) || !(peakSpeed > 0)) return 0;
  const decelShare = Math.min(1, zones.decelerationDistance / approach);
  return (approach * (1 + decelShare)) / peakSpeed;
};

/**
 * Duration of the pre-teleport preflight segment: enter at `startSpeed`,
 * accelerate to cruise over the local acceleration budget, cruise the rest.
 * Zone times: acceleration `2·a·P/(s+p)` (average speed `(s+p)/2`) plus
 * cruise `(1-a)·P/p`. The mirror of `resolveGoToApproachDuration`.
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
  const accelShare = Math.min(1, zones.accelerationDistance / preflight);
  const entrySpeed = Math.max(0, startSpeed);
  const accelDistance = accelShare * preflight;
  return (
    (2 * accelDistance) / (entrySpeed + peakSpeed) +
    ((1 - accelShare) * preflight) / peakSpeed
  );
};

/**
 * TOTAL animated time of a far-GO_TO flight: preflight + approach (the
 * teleport cut itself is instant). This is also the TIME CEILING of every
 * continuous GO_TO ride while the teleport is enabled: a ride that would
 * take longer than a flight is compressed to exactly this duration (it
 * cruises faster than the shared jump speed), so ride and flight durations
 * meet seamlessly at the gate — no jump is ever slower than a farther one.
 * Derived entirely from existing knobs (preflight span, approach span,
 * cruise speed, local ramp budgets) — valid for ANY knob ratio; degenerate
 * tunings (zero animated flight distance) yield `0`, which consumers treat
 * as "no ceiling".
 *
 * With the teleport DISABLED the ceiling is deliberately not applied:
 * every ride keeps the one shared cruise speed and duration grows with
 * distance (consistent SPEED, not consistent time).
 */
export const resolveGoToFlightDuration = (
  stepSize: number,
  motion: MotionSettings,
  peakSpeed: number,
  startSpeed = 0,
): number =>
  resolveGoToPreflightDuration(stepSize, motion, peakSpeed, startSpeed) +
  resolveGoToApproachDuration(stepSize, motion, peakSpeed);
