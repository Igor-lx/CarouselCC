// See docs/architecture/motion.md
import { useCallback } from "react";

import type { CarouselDispatch } from "../state";
import { useMotionRunner, type UseMotionRunnerInput } from "./useMotionRunner";

/** The runner's own input, with the settle callback replaced by the dispatch
 * it is derived from — adding a runner field extends this hook automatically. */
interface UseCarouselMotionExecutionInput
  extends Omit<UseMotionRunnerInput, "onSettle"> {
  dispatch: CarouselDispatch;
}

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
