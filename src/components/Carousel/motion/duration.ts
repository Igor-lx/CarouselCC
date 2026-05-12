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

interface ResolveDurationInput {
  motionPhase: MotionPhase;
  moveReason: MoveReason;
  isInstant: boolean;
  isDragging: boolean;
  isRepeatedClickAdvance: boolean;
  segmentStartVirtualIndex: number;
  targetVirtualIndex: number;
  stepSize: number;
  snapBackDuration: number;
  repeatedClickSpeedMultiplier: number;
  autoplayDuration: number;
  stepDuration: number;
  jumpDuration: number;
  gestureReleaseDuration: number;
}

export const resolveCarouselDuration = ({
  motionPhase,
  moveReason,
  isInstant,
  isDragging,
  isRepeatedClickAdvance,
  segmentStartVirtualIndex,
  targetVirtualIndex,
  stepSize,
  snapBackDuration,
  repeatedClickSpeedMultiplier,
  autoplayDuration,
  stepDuration,
  jumpDuration,
  gestureReleaseDuration,
}: ResolveDurationInput): number => {
  if (isDragging) return 0;
  if (motionPhase === "step-snap") return snapBackDuration;
  if (isInstant || motionPhase === "step-jump") return jumpDuration;

  const clickSegmentDuration = durationByVirtualSpan({
    from: segmentStartVirtualIndex,
    to: targetVirtualIndex,
    stepSize,
    baseDuration: stepDuration,
  });

  if (moveReason === "click" && isRepeatedClickAdvance) {
    return clickSegmentDuration / Math.max(1, repeatedClickSpeedMultiplier);
  }

  switch (moveReason) {
    case "click":
      return clickSegmentDuration;
    case "autoplay":
      return autoplayDuration;
    case "gesture":
      return gestureReleaseDuration;
    default:
      return autoplayDuration;
  }
};
