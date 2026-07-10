import { useCallback } from "react";

import type { CarouselDispatch } from "../state";
import { useMotionRunner, type UseMotionRunnerInput } from "./useMotionRunner";

/** The runner's own input, with the settle callback replaced by the dispatch
 * it is derived from — adding a runner field extends this hook automatically. */
interface UseCarouselMotionExecutionInput
  extends Omit<UseMotionRunnerInput, "onSettle"> {
  dispatch: CarouselDispatch;
}

/**
 * Post-state motion orchestration: wires the settle feedback into the state
 * machine and mounts the runner — the sole `state -> segment -> controller`
 * bridge. Temporal presentation data reaches paint consumers through the
 * motion-plan channel, not through React values.
 */
export function useCarouselMotionExecution({
  dispatch,
  ...runnerInput
}: UseCarouselMotionExecutionInput): void {
  const handleMotionSettled = useCallback(
    (settledPosition: number) =>
      dispatch({ type: "MOTION_SETTLED", settledPosition }),
    [dispatch],
  );

  useMotionRunner({ ...runnerInput, onSettle: handleMotionSettled });
}
