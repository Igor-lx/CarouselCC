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
  return baseDuration * Math.max(0, span);
};

interface ResolveEasingDurationInput {
  motionPhase: MotionPhase;
  moveReason: MoveReason;
  isInstant: boolean;
  isDragging: boolean;
  segmentStartVirtualIndex: number;
  targetVirtualIndex: number;
  stepSize: number;
  snapBackDuration: number;
  autoplayDuration: number;
  stepDuration: number;
  jumpDuration: number;
}

/**
 * Resolve durations only for duration-authored bezier segments.
 *
 * Profile segments are intentionally absent from this resolver: their speed
 * model owns peak velocity and derives duration from distance + zone speeds.
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
  jumpDuration,
}: ResolveEasingDurationInput): number => {
  if (isDragging) return 0;
  if (motionPhase === "step-snap") return snapBackDuration;
  if (isInstant || motionPhase === "step-jump") return jumpDuration;

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
