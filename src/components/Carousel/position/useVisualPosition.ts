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

/**
 * Sole owner of the visual position SSOT. Wraps a single `MotionController`
 * and exposes:
 *
 * - `subscribe(listener)` — per-frame stream while a segment is active.
 *   Subscribers (track binding, pagination widget binding) mutate their own
 *   DOM inside the callback; React is not involved at this tempo.
 * - `getSnapshot()` returns the last *emitted* visual frame. Cold reads on
 *   user events (gesture press start, navigation click) read through this
 *   so the captured origin matches what DOM subscribers have already
 *   received, not a freshly re-sampled but unpainted controller value. A
 *   re-sampled now-value would force the track to "catch up" in a single
 *   composite frame, which the eye perceives as a forward jerk on click /
 *   press.
 * - `applyImmediatePosition(position)` — publish a position into the stream
 *   during drag. Internally calls `controller.set`, which cancels any active
 *   motion and emits, so the track, the widget, and the motion runner all
 *   observe one consistent source of truth throughout the gesture.
 */
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
      (sample) => emit(toFrame(sample, stepSizeRef.current)),
      { emitCurrent: false },
    );
    return unsubscribe;
  }, [controller, emit]);

  const getSnapshot = useCallback<VisualPositionSource["getSnapshot"]>(
    () => lastFrameRef.current,
    [],
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
    () => ({ getSnapshot, subscribe }),
    [getSnapshot, subscribe],
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
