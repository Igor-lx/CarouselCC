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
 *   Subscribers (track binding, pagination widget binding) mutate their
 *   own DOM directly inside the callback; they never go through React.
 * - `getSnapshot()` — a *fresh* re-sample of the controller at `now()`.
 *   Used for cold reads on user events (gesture press start, click).
 *   Re-sampling is required so the gesture/click origin matches what the
 *   user actually sees, not the value from the previous RAF tick.
 * - `applyImmediatePosition(position)` — writes the position into the
 *   controller during a drag. Cancels any active motion and emits, so the
 *   track, the widget, and any other subscriber all stay synchronised on a
 *   single per-frame stream throughout the drag.
 */
export function useVisualPosition({
  visibleSlidesCount,
}: UseVisualPositionInput): UseVisualPositionResult {
  const controller = useMotionController<CarouselMotionStrategy>(0, "idle");

  const stepSizeRef = useRef(visibleSlidesCount);
  stepSizeRef.current = visibleSlidesCount;

  const listenersRef = useRef<Set<VisualPositionListener>>(new Set());

  const emit = useCallback((frame: VisualPositionFrame) => {
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
    () => toFrame(controller.read(), stepSizeRef.current),
    [controller],
  );

  useIsomorphicLayoutEffect(() => {
    emit(getSnapshot());
  }, [emit, getSnapshot, visibleSlidesCount]);

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
