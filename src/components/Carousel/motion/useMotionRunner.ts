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

const buildStartFromSample = (
  sample: MotionSample<CarouselMotionStrategy>,
): MotionStart => ({
  position: sample.value,
  velocity: sample.velocity,
  strategy: sample.strategy,
});

/**
 * Origin of a post-drag release segment. The state machine wrote
 * `fromVirtualIndex` from the visually-sampled release position at END_DRAG,
 * so we read it here directly. We deliberately do NOT use the motion
 * controller's snapshot: drag bypasses the controller (immediate transform
 * writes via `applyTrackPosition`), so the controller's `sample` is stale
 * for the entire drag span and using it would jump the track back to the
 * pre-drag logical origin before the release segment animates.
 */
const buildStartFromGesture = (state: CarouselState): MotionStart => ({
  position: state.fromVirtualIndex,
  velocity: state.gesture.uiVelocity,
  strategy: "gesture",
});

const buildStartFromIdle = (
  currentPosition: number,
  fallbackVelocity: number,
): MotionStart => ({
  position: currentPosition,
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
      controller.snap(state.virtualIndex, { strategy: "idle" });
      handoffSnapshotRef.current = null;
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "idle" || state.motionPhase === "dragging") {
      if (state.motionPhase === "idle") {
        controller.snap(state.virtualIndex, { strategy: "idle" });
        handoffSnapshotRef.current = null;
        onDurationChange?.(0);
      }
      return;
    }

    if (state.motionPhase === "step-instant") {
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
        completion: state.followUpVirtualIndex !== null ? "immediate" : "next-frame",
      });
      onDurationChange?.(0);
      return;
    }

    const isActive = controller.isActive();
    const now = performance.now();
    const currentSample = controller.read();
    const handoff = handoffSnapshotRef.current;

    let start: MotionStart;
    let startedAt = now;
    let isRepeatedFollowUp = false;
    let consumedHandoff = false;

    if (isActive) {
      start = buildStartFromSample(currentSample);
    } else if (
      handoff &&
      Math.abs(handoff.position - state.fromVirtualIndex) < config.motion.epsilon
    ) {
      start = {
        position: handoff.position,
        velocity: handoff.velocity,
        strategy: handoff.strategy,
      };
      startedAt = handoff.timestamp;
      isRepeatedFollowUp = handoff.strategy === "repeated";
      consumedHandoff = true;
    } else if (state.moveReason === "gesture") {
      start = buildStartFromGesture(state);
    } else {
      start = buildStartFromIdle(currentSample.value, currentSample.velocity);
    }

    const distance = state.virtualIndex - start.position;

    if (Math.abs(distance) < config.motion.epsilon) {
      controller.snap(state.virtualIndex, {
        strategy: start.strategy,
        velocity: start.velocity,
        onComplete: settle,
        completion: state.followUpVirtualIndex !== null ? "immediate" : "next-frame",
      });
      onDurationChange?.(0);
      return;
    }

    const { segment, duration } = buildCarouselSegment({
      state,
      config,
      isInstantMode,
      isDragging,
      isRepeatedFollowUp,
      start,
      startedAt,
    });

    if (consumedHandoff) {
      handoffSnapshotRef.current = null;
    }

    onDurationChange?.(duration);

    controller.start({
      segment,
      sampler: sampleCarouselSegment,
      onComplete: settle,
      completion: state.followUpVirtualIndex !== null ? "immediate" : "next-frame",
    });
  }, [
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    onDurationChange,
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
      controller.cancel();
    },
    [controller],
  );
}
