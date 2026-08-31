// See docs/architecture/motion.md
import type { CarouselMotionIntent } from "./types";

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
  /** What the motion IS, decided once by `intentFromState`. Never re-derived
   * from the state here: the state has three fields that could each be read as
   * a different answer, and a second ladder over them drifts from the first. */
  intent: CarouselMotionIntent;
  segmentStartVirtualIndex: number;
  targetVirtualIndex: number;
  stepSize: number;
  snapBackDurationMs: number;
  autoplayDuration: number;
  stepDuration: number;
}

/** Duration for the duration-authored steps only; speed-authored motions
 * derive their own. See docs/architecture/motion.md. */
export const resolveStepDuration = ({
  intent,
  segmentStartVirtualIndex,
  targetVirtualIndex,
  stepSize,
  snapBackDurationMs,
  autoplayDuration,
  stepDuration,
}: ResolveStepDurationInput): number => {
  const clickSegmentDuration = durationByVirtualSpan({
    from: segmentStartVirtualIndex,
    to: targetVirtualIndex,
    stepSize,
    baseDuration: stepDuration,
  });

  switch (intent) {
    case "instant":
      return 0;
    case "snap":
      return snapBackDurationMs;
    case "autoplay-step":
      return autoplayDuration;
    // A committed but unhurried release is not speed-authored: it rides at the
    // click tempo, and only a flick builds its own profile.
    case "gesture-release":
    case "click-step":
      return clickSegmentDuration;
    // Speed-authored intents never reach here (the factory returns before
    // this), and a step with no reason recorded takes the calmest tempo.
    default:
      return autoplayDuration;
  }
};
