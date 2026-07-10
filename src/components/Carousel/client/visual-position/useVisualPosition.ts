import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  useMotionController,
  type MotionController,
  type MotionSample,
} from "../../../../shared";
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
  runningFrameIndex: number,
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
  runningFrameIndex,
});

export function useVisualPosition({
  visibleSlidesCount,
}: UseVisualPositionInput): UseVisualPositionResult {
  const controller = useMotionController<CarouselMotionStrategy>(0, "idle");

  const stepSizeRef = useRef(visibleSlidesCount);
  stepSizeRef.current = visibleSlidesCount;

  // Streak counter behind `VisualPositionFrame.runningFrameIndex`: running
  // emits are numbered 0, 1, 2, …; any resting emit resets the streak. Stamped
  // here, at the single source, so every subscriber sees identical numbering
  // (the shared fallback frame-skip depends on that).
  const runningStreakRef = useRef(0);
  const nextRunningFrameIndex = useCallback(
    (phase: MotionSample["phase"]): number => {
      if (phase !== "running") {
        runningStreakRef.current = 0;
        return 0;
      }
      const index = runningStreakRef.current;
      runningStreakRef.current += 1;
      return index;
    },
    [],
  );

  const listenersRef = useRef<Set<VisualPositionListener>>(new Set());
  const lastFrameRef = useRef<VisualPositionFrame>(
    toFrame(controller.getSnapshot(), visibleSlidesCount, 0),
  );

  const emit = useCallback((frame: VisualPositionFrame) => {
    lastFrameRef.current = frame;
    listenersRef.current.forEach((listener) => listener(frame));
  }, []);

  useEffect(() => {
    const unsubscribe = controller.subscribe(
      (sample) => {
        emit(toFrame(sample, stepSizeRef.current, nextRunningFrameIndex(sample.phase)));
      },
      { emitCurrent: false },
    );
    return unsubscribe;
  }, [controller, emit, nextRunningFrameIndex]);

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
    const snapshot = controller.getSnapshot();
    emit(toFrame(snapshot, stepSizeRef.current, nextRunningFrameIndex(snapshot.phase)));
  }, [controller, emit, nextRunningFrameIndex, visibleSlidesCount]);

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
