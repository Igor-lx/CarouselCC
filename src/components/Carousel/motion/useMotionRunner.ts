import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { CarouselState } from "../state";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";
import type { CarouselMotionStrategy, MotionStart } from "./types";

interface UseMotionRunnerInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
  /**
   * Called by the controller when a segment naturally settles. The argument
   * is the visual position where it settled, so the reducer can distinguish
   * a finished current target from an older target that settled after a newer
   * click had already been queued.
   */
  onSettle: (settledPosition: number) => void;
  onAutoplayDurationCancel?: () => void;
  onAutoplayDurationChange?: (duration: number) => void;
}

/**
 * Number of RAF ticks the runner waits before swapping the active segment for
 * a click that lands during motion. The old segment keeps painting during the
 * window. At the deferred boundary the successor segment starts from one
 * atomic `captureHandoff` point of the old curve.
 */
const RETARGET_FRAME_DELAY = 2;

/**
 * Origin of a post-drag release segment. Drag writes are published into the
 * visual position stream, while END_DRAG records the release position and
 * release velocity in state. The reducer payload stays canonical here because
 * it binds the sampled position and the release velocity to the same event.
 */
const buildStartFromGesture = (state: CarouselState): MotionStart => ({
  position: state.fromVirtualIndex,
  velocity: state.gesture.uiVelocity,
  strategy: "gesture",
});

const buildStartFromState = (
  state: CarouselState,
  fallbackVelocity: number,
): MotionStart => ({
  position: state.fromVirtualIndex,
  velocity: fallbackVelocity,
  strategy: "easing",
});

/**
 * The motion runner is the only bridge between logical state and the motion
 * controller.
 *
 * Mid-flight retargets keep the old segment painting for a tiny frame-boundary
 * window. At the boundary, the successor segment starts from a single atomic
 * `controller.captureHandoff(t)` — a coherent `(position, velocity)` taken
 * from the *same* sample of the old curve. Position and velocity can no longer
 * be sourced from two different moments (see motion §4.2).
 *
 * Every segment - first click, repeated click, gesture release - drives
 * directly to `state.virtualIndex`. There is no intermediate destination and
 * no chained follow-up segment.
 */
export function useMotionRunner({
  state,
  config,
  controller,
  isInstantMode,
  isDragging,
  enabled,
  onSettle,
  onAutoplayDurationCancel,
  onAutoplayDurationChange,
}: UseMotionRunnerInput): void {
  const lastKeyRef = useRef<string>("");
  const retargetFrameRef = useRef<number | null>(null);
  const retargetTokenRef = useRef(0);

  const cancelDeferredRetarget = useCallback(() => {
    retargetTokenRef.current += 1;
    if (retargetFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(retargetFrameRef.current);
    }
    retargetFrameRef.current = null;
  }, []);

  const scheduleDeferredRetarget = useCallback(
    (callback: (timestamp: number) => void) => {
      cancelDeferredRetarget();

      if (typeof window === "undefined") {
        callback(performance.now());
        return;
      }

      const token = retargetTokenRef.current;
      let framesLeft = RETARGET_FRAME_DELAY;

      const tick: FrameRequestCallback = (timestamp) => {
        if (retargetTokenRef.current !== token) return;

        framesLeft -= 1;
        if (framesLeft > 0) {
          retargetFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        retargetFrameRef.current = null;
        callback(timestamp);
      };

      retargetFrameRef.current = window.requestAnimationFrame(tick);
    },
    [cancelDeferredRetarget],
  );

  const settle = useCallback(
    (sample: MotionSample<CarouselMotionStrategy>) => {
      onSettle(sample.value);
    },
    [onSettle],
  );

  useIsomorphicLayoutEffect(() => {
    const key = [
      enabled,
      state.motionPhase,
      state.moveReason,
      state.virtualIndex,
      state.fromVirtualIndex,
      state.teleportVirtualIndex,
      state.isTeleportApproach,
      state.isRepeatedClickAdvance,
      state.gesture.pointerVelocity,
      state.gesture.uiVelocity,
      isInstantMode,
      isDragging,
    ].join(":");

    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (!enabled) {
      cancelDeferredRetarget();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      cancelDeferredRetarget();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      cancelDeferredRetarget();
      onAutoplayDurationCancel?.();
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelDeferredRetarget();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
      });
      return;
    }

    const startedNow = performance.now();
    const isActive = controller.isActive();
    const coldHandoff = isActive ? null : controller.captureHandoff(startedNow);

    const startResolvedMotion = (
      resolvedStart: MotionStart,
      resolvedStartedAt: number,
    ) => {
      const distance = state.virtualIndex - resolvedStart.position;

      if (Math.abs(distance) < config.motion.epsilon) {
        controller.snap(state.virtualIndex, {
          strategy: resolvedStart.strategy,
          velocity: resolvedStart.velocity,
          onComplete: settle,
        });
        onAutoplayDurationCancel?.();
        return;
      }

      const { segment, duration } = buildCarouselSegment({
        state,
        config,
        isInstantMode,
        isDragging,
        start: resolvedStart,
        startedAt: resolvedStartedAt,
      });

      // Autoplay duration is the only thing the runner needs to publish, and
      // it is published for every autoplay segment - including the finite-mode
      // loop-back GO_TO, whose intent is "jump" but whose moveReason is still
      // "autoplay". Reading moveReason keeps the runner free of intent
      // taxonomy and matches the user-facing "during autoplay" guarantee.
      if (state.moveReason === "autoplay") {
        onAutoplayDurationChange?.(duration);
      } else {
        onAutoplayDurationCancel?.();
      }

      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });
    };

    if (isActive) {
      scheduleDeferredRetarget((retargetTimestamp) => {
        // One atomic point: position + velocity + time from the same sample.
        const handoff = controller.captureHandoff(retargetTimestamp);
        startResolvedMotion(
          {
            position: handoff.position,
            velocity: handoff.velocity,
            strategy: handoff.strategy,
          },
          handoff.timestamp,
        );
      });
      return;
    }

    cancelDeferredRetarget();

    if (state.moveReason === "gesture") {
      startResolvedMotion(buildStartFromGesture(state), startedNow);
      return;
    }

    // Cold start from idle: the logical origin is owned by the reducer
    // (`state.fromVirtualIndex`); only the residual velocity comes from the
    // controller. That cross-layer split is intentional — not a mixed handoff.
    startResolvedMotion(
      buildStartFromState(state, coldHandoff?.velocity ?? 0),
      startedNow,
    );
  }, [
    cancelDeferredRetarget,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    onAutoplayDurationCancel,
    onAutoplayDurationChange,
    scheduleDeferredRetarget,
    settle,
    state.fromVirtualIndex,
    state.gesture.pointerVelocity,
    state.gesture.uiVelocity,
    state.isTeleportApproach,
    state.isRepeatedClickAdvance,
    state.motionPhase,
    state.moveReason,
    state.teleportVirtualIndex,
    state.virtualIndex,
  ]);

  useEffect(
    () => () => {
      cancelDeferredRetarget();
      controller.cancel();
    },
    [cancelDeferredRetarget, controller],
  );
}
