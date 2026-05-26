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
 * Number of rAF ticks the runner waits before starting a continuous segment.
 *
 * Cold starts wait so the commit that expanded the render window can reach
 * the compositor before the segment clock starts ticking. Hot retargets wait
 * the same amount while the old segment keeps painting, then continue from one
 * atomic `captureHandoff` point of the old curve.
 */
const COLD_START_FRAME_DELAY = 2;
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
 * Continuous segments are started after a tiny frame-boundary window. For a
 * cold start this gives the commit's first paint room to finish; for a
 * mid-flight retarget the old segment keeps painting until the successor can
 * start from a single atomic `controller.captureHandoff(t)` point. Position
 * and velocity can no longer be sourced from two different moments (see
 * motion section 4.2).
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
  const startFrameRef = useRef<number | null>(null);
  const startTokenRef = useRef(0);

  const cancelDeferredStart = useCallback(() => {
    startTokenRef.current += 1;
    if (startFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(startFrameRef.current);
    }
    startFrameRef.current = null;
  }, []);

  const scheduleDeferredStart = useCallback(
    (frameDelay: number, callback: (timestamp: number) => void) => {
      cancelDeferredStart();

      if (typeof window === "undefined") {
        callback(performance.now());
        return;
      }

      const token = startTokenRef.current;
      let framesLeft = Math.max(1, frameDelay);

      const tick: FrameRequestCallback = (timestamp) => {
        if (startTokenRef.current !== token) return;

        framesLeft -= 1;
        if (framesLeft > 0) {
          startFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        startFrameRef.current = null;
        callback(timestamp);
      };

      startFrameRef.current = window.requestAnimationFrame(tick);
    },
    [cancelDeferredStart],
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
      cancelDeferredStart();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      cancelDeferredStart();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      cancelDeferredStart();
      onAutoplayDurationCancel?.();
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelDeferredStart();
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
      });
      return;
    }

    const isActive = controller.isActive();

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
        clockStart: "after-initial-frame",
      });
    };

    if (isActive) {
      scheduleDeferredStart(RETARGET_FRAME_DELAY, (retargetTimestamp) => {
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

    scheduleDeferredStart(COLD_START_FRAME_DELAY, (startedAt) => {
      if (state.moveReason === "gesture") {
        startResolvedMotion(buildStartFromGesture(state), startedAt);
        return;
      }

      // Cold start from idle: the logical origin is owned by the reducer
      // (`state.fromVirtualIndex`); only residual velocity comes from the
      // controller. The segment timestamp is the deferred rAF timestamp, so
      // the clock does not advance while the commit's first paint is blocked.
      const handoff = controller.captureHandoff(startedAt);
      startResolvedMotion(
        buildStartFromState(state, handoff.velocity),
        startedAt,
      );
    });
  }, [
    cancelDeferredStart,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    onAutoplayDurationCancel,
    onAutoplayDurationChange,
    scheduleDeferredStart,
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
      cancelDeferredStart();
      controller.cancel();
    },
    [cancelDeferredStart, controller],
  );
}
