import { useCallback } from "react";

import type { MotionController } from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselDispatch, CarouselState } from "../state";
import type { CarouselMotionStrategy } from "./types";
import type { MotionPlanChannel } from "./planChannel";
import { useMotionRunner } from "./useMotionRunner";

interface UseCarouselMotionExecutionInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  dispatch: CarouselDispatch;
  isInstantMode: boolean;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  publishPlan: MotionPlanChannel["publish"];
}

/**
 * Post-state motion orchestration: wires the settle feedback into the state
 * machine and mounts the runner — the sole `state -> segment -> controller`
 * bridge. Temporal presentation data reaches paint consumers through the
 * motion-plan channel, not through React values.
 */
export function useCarouselMotionExecution({
  state,
  config,
  controller,
  dispatch,
  isInstantMode,
  startCompositorMotion,
  cancelCompositorMotion,
  publishPlan,
}: UseCarouselMotionExecutionInput): void {
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
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan,
    onSettle: handleMotionSettled,
  });
}
