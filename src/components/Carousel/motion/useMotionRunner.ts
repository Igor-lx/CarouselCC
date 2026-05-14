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

interface HandoffSnapshot {
  position: number;
  velocity: number;
  timestamp: number;
  target: number;
  strategy: CarouselMotionStrategy;
}

interface UseMotionRunnerInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
  onSettle: () => void;
  onDurationChange?: (duration: number) => void;
}

const RETARGET_FRAME_DELAY = 2;

const buildStartFromVisualHandoff = (
  visualSample: MotionSample<CarouselMotionStrategy>,
  velocitySample: MotionSample<CarouselMotionStrategy>,
): MotionStart => ({
  position: visualSample.value,
  velocity: velocitySample.velocity,
  strategy: visualSample.strategy,
});

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

export function useMotionRunner({
  state,
  config,
  controller,
  isInstantMode,
  isDragging,
  enabled,
  onSettle,
  onDurationChange,
}: UseMotionRunnerInput): void {
  const handoffSnapshotRef = useRef<HandoffSnapshot | null>(null);
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
      if (state.followUpVirtualIndex !== null) {
        handoffSnapshotRef.current = {
          position: sample.value,
          velocity: sample.velocity,
          timestamp: sample.timestamp,
          target: sample.target,
          strategy: sample.strategy,
        };
      } else {
        handoffSnapshotRef.current = null;
      }
      onSettle();
    },
    [onSettle, state.followUpVirtualIndex],
  );

  useIsomorphicLayoutEffect(() => {
    const key = [
      enabled,
      state.motionPhase,
      state.moveReason,
      state.virtualIndex,
      state.fromVirtualIndex,
      state.followUpVirtualIndex,
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
      controller.snap(state.virtualIndex, { strategy: "idle" });
      handoffSnapshotRef.current = null;
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "idle") {
      cancelDeferredRetarget();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      handoffSnapshotRef.current = null;
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "dragging") {
      cancelDeferredRetarget();
      handoffSnapshotRef.current = null;
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelDeferredRetarget();
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
        completion: state.followUpVirtualIndex !== null ? "immediate" : "next-frame",
      });
      onDurationChange?.(0);
      return;
    }

    // User-input handoff invariant: position must come from the last emitted
    // visual sample, because that is what DOM subscribers have already seen.
    // Velocity is sampled at the deferred retarget boundary so the successor
    // keeps the in-flight speed without jumping the track position.
    const startedNow = performance.now();
    const isActive = controller.isActive();
    const currentSample = isActive ? null : controller.read(startedNow);
    const handoff = handoffSnapshotRef.current;

    let start: MotionStart;
    let startedAt = startedNow;
    let isRepeatedFollowUp = false;
    let consumedHandoff = false;

    const startResolvedMotion = (
      resolvedStart: MotionStart,
      resolvedStartedAt: number,
      resolvedIsRepeatedFollowUp: boolean,
      shouldConsumeHandoff: boolean,
    ) => {
      const distance = state.virtualIndex - resolvedStart.position;

      if (Math.abs(distance) < config.motion.epsilon) {
        controller.snap(state.virtualIndex, {
          strategy: resolvedStart.strategy,
          velocity: resolvedStart.velocity,
          onComplete: settle,
          completion: state.followUpVirtualIndex !== null
            ? "immediate"
            : "next-frame",
        });
        onDurationChange?.(0);
        return;
      }

      const { segment, duration } = buildCarouselSegment({
        state,
        config,
        isInstantMode,
        isDragging,
        isRepeatedFollowUp: resolvedIsRepeatedFollowUp,
        start: resolvedStart,
        startedAt: resolvedStartedAt,
      });

      if (shouldConsumeHandoff) {
        handoffSnapshotRef.current = null;
      }

      onDurationChange?.(duration);

      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
        completion: state.followUpVirtualIndex !== null
          ? "immediate"
          : "next-frame",
      });
    };

    if (isActive) {
      scheduleDeferredRetarget((retargetTimestamp) => {
        const retargetVisualSample = controller.getSnapshot();
        const retargetVelocitySample = controller.read(retargetTimestamp);
        const retargetStart = buildStartFromVisualHandoff(
          retargetVisualSample,
          retargetVelocitySample,
        );
        startResolvedMotion(retargetStart, retargetTimestamp, false, false);
      });
      return;
    } else if (state.moveReason === "gesture") {
      cancelDeferredRetarget();
      start = buildStartFromGesture(state);
    } else if (
      handoff &&
      Math.abs(handoff.position - state.fromVirtualIndex) < config.motion.epsilon
    ) {
      cancelDeferredRetarget();
      start = {
        position: handoff.position,
        velocity: handoff.velocity,
        strategy: handoff.strategy,
      };
      startedAt = handoff.timestamp;
      isRepeatedFollowUp = handoff.strategy === "repeated";
      consumedHandoff = true;
    } else {
      cancelDeferredRetarget();
      start = buildStartFromState(state, currentSample?.velocity ?? 0);
    }

    startResolvedMotion(start, startedAt, isRepeatedFollowUp, consumedHandoff);
  }, [
    cancelDeferredRetarget,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    onDurationChange,
    scheduleDeferredRetarget,
    settle,
    state.followUpVirtualIndex,
    state.fromVirtualIndex,
    state.gesture.pointerVelocity,
    state.gesture.uiVelocity,
    state.isRepeatedClickAdvance,
    state.motionPhase,
    state.moveReason,
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
