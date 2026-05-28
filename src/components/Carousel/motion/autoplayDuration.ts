import type { CarouselRuntimeConfig } from "../config";
import type { CarouselState } from "../state";
import { buildCarouselSegment } from "./segmentFactory";
import type { MotionStart } from "./types";

interface ResolveAutoplayMotionDurationInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
}

const shouldPublishAutoplayDuration = (
  state: CarouselState,
  enabled: boolean,
): boolean =>
  enabled &&
  state.moveReason === "autoplay" &&
  state.motionPhase !== "idle" &&
  state.motionPhase !== "dragging";

export const resolveAutoplayMotionDuration = ({
  state,
  config,
  isInstantMode,
  isDragging,
  enabled,
}: ResolveAutoplayMotionDurationInput): number => {
  if (!shouldPublishAutoplayDuration(state, enabled)) return 0;

  const start: MotionStart = {
    position: state.fromVirtualIndex,
    velocity: 0,
    strategy: "easing",
  };

  if (Math.abs(state.virtualIndex - start.position) < config.motion.epsilon) {
    return 0;
  }

  return buildCarouselSegment({
    state,
    config,
    isInstantMode,
    isDragging,
    start,
    startedAt: 0,
  }).duration;
};
