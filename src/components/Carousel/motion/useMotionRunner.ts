import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionClockStart,
  type MotionController,
  type MotionFrameDeltaClamp,
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
 * Long carousel segments make hidden frame drops visible as catch-up jumps.
 * Cap only clearly missed frames, and leave very short motions on pure
 * wall-clock sampling where the extra policy would be more noticeable than
 * useful.
 */
const MOTION_CATCH_UP_CLAMP: MotionFrameDeltaClamp = {
  maxFrameDeltaMs: 50,
  minSegmentDurationMs: 500,
};

const readNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

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
 * Continuous segments start in the layout-effect turn that observes the
 * logical state. Cold starts rely on the controller's `after-initial-frame`
 * clock arming, while retargets restart from the last emitted visual sample so
 * a click never inherits a mathematically sampled position the user has not
 * seen yet.
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
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      onAutoplayDurationCancel?.();
      return;
    }

    if (state.motionPhase === "step-instant") {
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
      clockStart: MotionClockStart,
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
        clockStart,
        frameDeltaClamp: MOTION_CATCH_UP_CLAMP,
      });
    };

    if (isActive) {
      const snapshot = controller.getSnapshot();
      startResolvedMotion(
        {
          position: snapshot.value,
          velocity: snapshot.velocity,
          strategy: snapshot.strategy,
        },
        readNow(),
        "immediate",
      );
      return;
    }

    const startedAt = readNow();
    if (state.moveReason === "gesture") {
      startResolvedMotion(
        buildStartFromGesture(state),
        startedAt,
        "after-initial-frame",
      );
      return;
    }

    // Cold start from idle: the logical origin is owned by the reducer
    // (`state.fromVirtualIndex`); only residual velocity comes from the
    // controller. The after-initial-frame clock absorbs the first paint delay.
    const handoff = controller.captureHandoff(startedAt);
    startResolvedMotion(
      buildStartFromState(state, handoff.velocity),
      startedAt,
      "after-initial-frame",
    );
  }, [
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    onAutoplayDurationCancel,
    onAutoplayDurationChange,
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
      controller.cancel();
    },
    [controller],
  );
}
