import { useCallback, useEffect, useRef, useState } from "react";

import type { MotionController } from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { CarouselDispatch, CarouselState } from "../state";
import type { CarouselMotionStrategy } from "./types";
import { useMotionRunner } from "./useMotionRunner";

interface UseCarouselMotionExecutionInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  dispatch: CarouselDispatch;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
}

interface UseCarouselMotionExecutionResult {
  motionDuration: number;
}

/**
 * Post-state motion orchestration. Keeps duration publication and
 * settle-feedback mechanics out of the composition root while the runner
 * remains the sole state -> segment -> controller bridge.
 */
export function useCarouselMotionExecution({
  state,
  config,
  controller,
  dispatch,
  isInstantMode,
  isDragging,
  enabled,
}: UseCarouselMotionExecutionInput): UseCarouselMotionExecutionResult {
  const [motionDuration, setMotionDuration] = useState(0);
  const motionDurationFrameRef = useRef<number | null>(null);
  const motionDurationTimeoutRef = useRef<number | null>(null);

  const cancelMotionDurationPublish = useCallback(() => {
    if (typeof window === "undefined") return;

    if (motionDurationFrameRef.current !== null) {
      window.cancelAnimationFrame(motionDurationFrameRef.current);
      motionDurationFrameRef.current = null;
    }

    if (motionDurationTimeoutRef.current !== null) {
      window.clearTimeout(motionDurationTimeoutRef.current);
      motionDurationTimeoutRef.current = null;
    }
  }, []);

  const publishMotionDuration = useCallback(
    (duration: number) => {
      if (typeof window === "undefined") {
        setMotionDuration(duration);
        return;
      }

      cancelMotionDurationPublish();

      motionDurationFrameRef.current = window.requestAnimationFrame(() => {
        motionDurationFrameRef.current = null;
        motionDurationTimeoutRef.current = window.setTimeout(() => {
          motionDurationTimeoutRef.current = null;
          setMotionDuration((current) =>
            current === duration ? current : duration,
          );
        }, 0);
      });
    },
    [cancelMotionDurationPublish],
  );

  useEffect(
    () => cancelMotionDurationPublish,
    [cancelMotionDurationPublish],
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
    onSettle: handleMotionSettled,
    onDurationChange: publishMotionDuration,
  });

  return { motionDuration };
}
