import { useCallback, useMemo } from "react";

import type { MotionController } from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselDispatch, CarouselState } from "../state";
import type { CarouselMotionStrategy } from "./types";
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
}

interface UseCarouselMotionExecutionResult {
  autoplayMotionDuration: number;
}

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
    onSettle: handleMotionSettled,
  });

  return { autoplayMotionDuration };
}
