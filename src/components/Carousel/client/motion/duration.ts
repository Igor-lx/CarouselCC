// See docs/architecture/motion.md
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

interface ResolveStepDurationInput {
  motionPhase: MotionPhase;
  moveReason: MoveReason | null;
  isInstant: boolean;
  segmentStartVirtualIndex: number;
  targetVirtualIndex: number;
  stepSize: number;
  snapBackDuration: number;
  autoplayDuration: number;
  stepDuration: number;
}

/** Duration for the duration-authored steps only; speed-authored motions
 * derive their own. See docs/architecture/motion.md. */
export const resolveStepDuration = ({
  motionPhase,
  moveReason,
  isInstant,
  segmentStartVirtualIndex,
  targetVirtualIndex,
  stepSize,
  snapBackDuration,
  autoplayDuration,
  stepDuration,
}: ResolveStepDurationInput): number => {
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
