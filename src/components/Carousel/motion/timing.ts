import type { MotionSettings } from "../config";

export const resolveSpeed = (distance: number, duration: number): number =>
  Math.abs(distance) / duration;

export const resolveJumpPeakSpeed = (
  stepSize: number,
  stepDuration: number,
  jumpSpeedMultiplier: number,
): number => resolveSpeed(stepSize, stepDuration) * jumpSpeedMultiplier;

export interface GoToProfileZones {
  accelerationDistance: number;
  decelerationDistance: number;
  preflightDistance: number;
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
  isTeleport: boolean;
  leadDistance: number;
  teleportDistance: number;
  approachDistance: number;
}

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

export const resolveGoToApproachDistance = (
  stepSize: number,
  motion: MotionSettings,
): number => resolveGoToProfileZones(stepSize, motion).approachDistance;
