import { useCallback, useMemo } from "react";

import type { MotionController } from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselDispatch, CarouselState } from "../state";
import type { CarouselMotionStrategy } from "./types";
import type { MotionPlanChannel } from "./planChannel";
import { resolveAutoplayMotionDuration } from "./autoplayDuration";
import { useMotionRunner } from "./useMotionRunner";

interface UseCarouselMotionExecutionInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  dispatch: CarouselDispatch;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  publishPlan: MotionPlanChannel["publish"];
}

interface UseCarouselMotionExecutionResult {
  autoplayMotionDuration: number;
}

/**
 * Post-state motion orchestration. The runner stays the sole
 * `state -> segment -> controller` bridge; the autoplay-pagination duration is
 * a pure derivation of the same state, so it is read here with a `useMemo`
 * rather than published back out of the runner.
 */
export function useCarouselMotionExecution({
  state,
  config,
  controller,
  dispatch,
  isInstantMode,
  isDragging,
  enabled,
  startCompositorMotion,
  cancelCompositorMotion,
  publishPlan,
}: UseCarouselMotionExecutionInput): UseCarouselMotionExecutionResult {
  const autoplayMotionDuration = useMemo(
    () =>
      resolveAutoplayMotionDuration({
        state,
        config,
        isInstantMode,
        isDragging,
        enabled,
      }),
    [config, enabled, isDragging, isInstantMode, state],
  );

  const handleMotionSettled = useCallback(
    (settledPosition: number) =>
      dispatch({ type: "MOTION_SETTLED", settledPosition }),
    [dispatch],
  );

  useMotionRunner({
    state,
    config,
    controller,
    isInstantMode,
    isDragging,
    enabled,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan,
    onSettle: handleMotionSettled,
  });

  return { autoplayMotionDuration };
}
