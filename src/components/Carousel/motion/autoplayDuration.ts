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

/**
 * Render-time duration used by pagination modules for autoplay dot sync.
 *
 * Autoplay commands are scheduled only from an idle carousel, so the reducer's
 * `fromVirtualIndex` is the canonical origin and residual velocity is zero.
 * Keeping this as pure derived data avoids a one-commit delay where pagination
 * would otherwise see the new target with the previous segment duration.
 */
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
