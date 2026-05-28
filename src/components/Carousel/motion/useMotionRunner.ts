import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselState } from "../state";
import { bezierToCss } from "./bezier";
import { canUseCompositorTrackMotion } from "./compositorEligibility";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";
import type {
  CarouselMotionStrategy,
  MotionStart,
} from "./types";

interface UseMotionRunnerInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  onSettle: (settledPosition: number) => void;
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const motionConfigKey = (config: CarouselRuntimeConfig): string =>
  [
    config.autoplayDuration,
    config.stepDuration,
    config.jumpSpeedMultiplier,
    config.motion.snapBackDuration,
    config.motion.epsilon,
    config.motion.goToPreflightPageSpan,
    config.motion.goToFinalApproachPageSpan,
    config.motion.goToAccelerationDistanceShare,
    config.motion.goToDecelerationDistanceShare,
    config.repeatedClick.speedMultiplier,
    config.repeatedClick.accelerationDistanceShare,
    config.repeatedClick.decelerationDistanceShare,
    config.releaseConfig.inertiaBoost,
    config.releaseConfig.decelerationDistanceShare,
  ].join(":");

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

export function useMotionRunner({
  state,
  config,
  controller,
  isInstantMode,
  isDragging,
  enabled,
  startCompositorMotion,
  cancelCompositorMotion,
  onSettle,
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
      motionConfigKey(config),
    ].join(":");

    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (!enabled) {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      cancelCompositorMotion(controller.getSnapshot().value);
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
      });
      return;
    }

    const startResolvedMotion = (
      resolvedStart: MotionStart,
      resolvedStartedAt: number,
    ) => {
      const distance = state.virtualIndex - resolvedStart.position;

      if (Math.abs(distance) < config.motion.epsilon) {
        cancelCompositorMotion(state.virtualIndex);
        controller.snap(state.virtualIndex, {
          strategy: resolvedStart.strategy,
          velocity: resolvedStart.velocity,
          onComplete: settle,
        });
        return;
      }

      const { segment } = buildCarouselSegment({
        state,
        config,
        isInstantMode,
        isDragging,
        start: resolvedStart,
        startedAt: resolvedStartedAt,
      });

      const isComposited =
        canUseCompositorTrackMotion(segment) &&
        startCompositorMotion({
          from: segment.from,
          to: segment.to,
          duration: segment.duration,
          easing: bezierToCss(segment.easing),
        });

      if (!isComposited) {
        cancelCompositorMotion(resolvedStart.position);
      }

      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });
    };

    const startedAt = now();

    if (controller.isActive()) {
      const handoff = controller.captureHandoff(startedAt);
      startResolvedMotion(
        {
          position: handoff.position,
          velocity: handoff.velocity,
          strategy: handoff.strategy,
        },
        handoff.timestamp,
      );
      return;
    }

    if (state.moveReason === "gesture") {
      startResolvedMotion(buildStartFromGesture(state), startedAt);
      return;
    }

    const handoff = controller.captureHandoff(startedAt);
    startResolvedMotion(buildStartFromState(state, handoff.velocity), startedAt);
  }, [
    cancelCompositorMotion,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    settle,
    startCompositorMotion,
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
      cancelCompositorMotion(controller.getSnapshot().value);
      controller.cancel();
    },
    [cancelCompositorMotion, controller],
  );
}
