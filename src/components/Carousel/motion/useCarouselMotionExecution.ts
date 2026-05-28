import { useCallback, useEffect, useRef, useState } from "react";

import type { MotionController } from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
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
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
}

interface UseCarouselMotionExecutionResult {
  autoplayMotionDuration: number;
}

/**
 * Post-state motion orchestration. Keeps autoplay-pagination duration and
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
  startCompositorMotion,
  cancelCompositorMotion,
}: UseCarouselMotionExecutionInput): UseCarouselMotionExecutionResult {
  const [autoplayMotionDuration, setAutoplayMotionDuration] = useState(0);
  const autoplayDurationFrameRef = useRef<number | null>(null);
  const autoplayDurationTimeoutRef = useRef<number | null>(null);

  const cancelAutoplayDurationPublish = useCallback(() => {
    if (typeof window === "undefined") return;

    if (autoplayDurationFrameRef.current !== null) {
      window.cancelAnimationFrame(autoplayDurationFrameRef.current);
      autoplayDurationFrameRef.current = null;
    }

    if (autoplayDurationTimeoutRef.current !== null) {
      window.clearTimeout(autoplayDurationTimeoutRef.current);
      autoplayDurationTimeoutRef.current = null;
    }
  }, []);

  const publishAutoplayDuration = useCallback(
    (duration: number) => {
      if (typeof window === "undefined") {
        setAutoplayMotionDuration(duration);
        return;
      }

      cancelAutoplayDurationPublish();

      autoplayDurationFrameRef.current = window.requestAnimationFrame(() => {
        autoplayDurationFrameRef.current = null;
        autoplayDurationTimeoutRef.current = window.setTimeout(() => {
          autoplayDurationTimeoutRef.current = null;
          setAutoplayMotionDuration((current) =>
            current === duration ? current : duration,
          );
        }, 0);
      });
    },
    [cancelAutoplayDurationPublish],
  );

  useEffect(
    () => cancelAutoplayDurationPublish,
    [cancelAutoplayDurationPublish],
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
    onAutoplayDurationCancel: cancelAutoplayDurationPublish,
    onAutoplayDurationChange: publishAutoplayDuration,
  });

  return { autoplayMotionDuration };
}
