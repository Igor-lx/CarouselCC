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

/**
 * Autoplay-step duration, derived purely from the current state — the only
 * value the pagination dot delay needs. Published for every autoplay-driven
 * segment, including the finite-mode loop-back GO_TO (intent "jump", reason
 * still "autoplay"). Reading `moveReason` keeps this free of intent taxonomy
 * and matches the user-facing "during autoplay" guarantee.
 *
 * This is a side-effect-free derivation, so the composition root reads it with
 * a plain `useMemo` instead of a deferred state publish from the motion runner.
 * The runner stays a pure `state -> controller` bridge.
 */
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
    strategy: "step",
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
