import type { MotionPhase, MoveReason } from "../state";

interface DurationByVirtualSpanInput {
  from: number;
  to: number;
  stepSize: number;
  baseDuration: number;
}

export const durationByVirtualSpan = ({
  from,
  to,
  stepSize,
  baseDuration,
}: DurationByVirtualSpanInput) => {
  if (!(stepSize > 0)) return baseDuration;
  const span = Math.abs(to - from) / stepSize;
  return baseDuration * span;
};

interface ResolveEasingDurationInput {
  motionPhase: MotionPhase;
  moveReason: MoveReason | null;
  isInstant: boolean;
  isDragging: boolean;
  segmentStartVirtualIndex: number;
  targetVirtualIndex: number;
  stepSize: number;
  snapBackDuration: number;
  autoplayDuration: number;
  stepDuration: number;
}

/**
 * Resolve durations only for duration-authored bezier segments: the click
 * step, the autoplay step, the snap-back, and a non-inertial gesture release.
 *
 * Profile segments are intentionally absent from this resolver - repeated
 * click, inertial gesture release, and every GO_TO / teleport segment own a
 * speed model that derives duration from distance + zone speeds.
 */
export const resolveEasingDuration = ({
  motionPhase,
  moveReason,
  isInstant,
  isDragging,
  segmentStartVirtualIndex,
  targetVirtualIndex,
  stepSize,
  snapBackDuration,
  autoplayDuration,
  stepDuration,
}: ResolveEasingDurationInput): number => {
  if (isDragging) return 0;
  if (motionPhase === "step-snap") return snapBackDuration;
  if (isInstant) return 0;

  const clickSegmentDuration = durationByVirtualSpan({
    from: segmentStartVirtualIndex,
    to: targetVirtualIndex,
    stepSize,
    baseDuration: stepDuration,
  });

  switch (moveReason) {
    case "click":
      return clickSegmentDuration;
    case "autoplay":
      return autoplayDuration;
    case "gesture":
      return clickSegmentDuration;
    default:
      return autoplayDuration;
  }
};
