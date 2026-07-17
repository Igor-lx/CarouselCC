import { useCallback } from "react";

import type { CarouselDispatch } from "../state";
import type { MotionPlanSource } from "./planChannel";
import { useMotionRunner, type UseMotionRunnerInput } from "./useMotionRunner";
import { useScrollRideYield } from "./useScrollRideYield";

/** The runner's own input, with the settle callback replaced by the dispatch
 * it is derived from — adding a runner field extends this hook automatically. */
interface UseCarouselMotionExecutionInput
  extends Omit<UseMotionRunnerInput, "onSettle"> {
  dispatch: CarouselDispatch;
  /** Read side of the plan channel — the scroll yield re-times plans from it. */
  planSource: MotionPlanSource;
}

/**
 * Post-state motion orchestration: wires the settle feedback into the state
 * machine and mounts the runner — the sole `state -> segment -> controller`
 * bridge — plus the scroll yield, which re-times the runner's in-flight
 * segments under page scrolling. Temporal presentation data reaches paint
 * consumers through the motion-plan channel, not through React values.
 */
export function useCarouselMotionExecution({
  dispatch,
  planSource,
  ...runnerInput
}: UseCarouselMotionExecutionInput): void {
  const handleMotionSettled = useCallback(
    (settledPosition: number) =>
      dispatch({ type: "MOTION_SETTLED", settledPosition }),
    [dispatch],
  );

  useMotionRunner({ ...runnerInput, onSettle: handleMotionSettled });

  useScrollRideYield({
    controller: runnerInput.controller,
    config: runnerInput.config,
    startCompositorMotion: runnerInput.startCompositorMotion,
    cancelCompositorMotion: runnerInput.cancelCompositorMotion,
    publishPlan: runnerInput.publishPlan,
    planSource,
    onSettle: handleMotionSettled,
  });
}
