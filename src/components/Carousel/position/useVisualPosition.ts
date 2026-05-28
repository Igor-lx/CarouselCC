import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  useMotionController,
  type MotionController,
  type MotionSample,
} from "../../../shared";
import type { CarouselMotionStrategy } from "../motion/types";
import type {
  VisualPositionFrame,
  VisualPositionListener,
  VisualPositionSource,
} from "./types";

interface UseVisualPositionInput {
  visibleSlidesCount: number;
}

export interface UseVisualPositionResult {
  source: VisualPositionSource;
  controller: MotionController<CarouselMotionStrategy>;
  applyImmediatePosition: (position: number) => void;
}

const toFrame = (
  sample: MotionSample<CarouselMotionStrategy>,
  visibleSlidesCount: number,
): VisualPositionFrame => ({
  position: sample.value,
  pageOffset: sample.value / visibleSlidesCount,
  velocity: sample.velocity,
  target: sample.target,
  targetPageOffset: sample.target / visibleSlidesCount,
  strategy: sample.strategy,
  timestamp: sample.timestamp,
  phase: sample.phase,
  progress: sample.progress,
});

export function useVisualPosition({
  visibleSlidesCount,
}: UseVisualPositionInput): UseVisualPositionResult {
  const controller = useMotionController<CarouselMotionStrategy>(0, "idle");

  const stepSizeRef = useRef(visibleSlidesCount);
  stepSizeRef.current = visibleSlidesCount;

  const listenersRef = useRef<Set<VisualPositionListener>>(new Set());
  const lastFrameRef = useRef<VisualPositionFrame>(
    toFrame(controller.getSnapshot(), visibleSlidesCount),
  );

  const emit = useCallback((frame: VisualPositionFrame) => {
    lastFrameRef.current = frame;
    listenersRef.current.forEach((listener) => listener(frame));
  }, []);

  useEffect(() => {
    const unsubscribe = controller.subscribe(
      (sample) => {
        emit(toFrame(sample, stepSizeRef.current));
      },
      { emitCurrent: false },
    );
    return unsubscribe;
  }, [controller, emit]);

  const getSnapshot = useCallback<VisualPositionSource["getSnapshot"]>(
    () => lastFrameRef.current,
    [],
  );

  // Exact current position from the controller's curve at `now()`, reflow-free.
  // `captureHandoff` is the controller's coherent continuation point — exactly
  // what a cold read that starts a new segment wants — so it is the right
  // source here, not the possibly-stale last-emitted frame.
  const sampleNow = useCallback<VisualPositionSource["sampleNow"]>(
    () => controller.captureHandoff().position,
    [controller],
  );

  useIsomorphicLayoutEffect(() => {
    emit(toFrame(controller.getSnapshot(), stepSizeRef.current));
  }, [controller, emit, visibleSlidesCount]);

  const subscribe = useCallback<VisualPositionSource["subscribe"]>(
    (listener, options) => {
      listenersRef.current.add(listener);
      if (options?.emitCurrent ?? true) {
        listener(getSnapshot());
      }
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [getSnapshot],
  );

  const source = useMemo<VisualPositionSource>(
    () => ({ getSnapshot, sampleNow, subscribe }),
    [getSnapshot, sampleNow, subscribe],
  );

  const applyImmediatePosition = useCallback(
    (position: number) => {
      controller.set(position, {
        target: position,
        velocity: 0,
        strategy: "gesture",
      });
    },
    [controller],
  );

  return { source, controller, applyImmediatePosition };
}
