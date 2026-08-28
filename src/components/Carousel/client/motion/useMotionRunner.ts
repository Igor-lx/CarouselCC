// See docs/architecture/motion.md
import { useCallback, useEffect, useRef } from "react";

import {
  motionNow,
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselState } from "../state";
import type { MotionPlanChannel, MotionPlanDirection } from "./planChannel";
import {
  buildProfile,
  profileProgressStops,
  resolvePeakSpeedForDuration,
} from "../../../../shared";
import { resolveCoastedLaunchPosition } from "../gesture/coast";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";
import { resolveGoToApproachDuration, resolveJumpPeakSpeed } from "./timing";
import type { CarouselMotionStrategy, MotionStart } from "./types";

export interface UseMotionRunnerInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  isInstantMode: boolean;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  /** Publishes the computed motion plan to paint consumers (widget). */
  publishPlan: MotionPlanChannel["publish"];
  /** The settled visual position, so the reducer can tell current from stale. */
  onSettle: (settledPosition: number) => void;
}

const directionOf = (delta: number): MotionPlanDirection =>
  delta > 0 ? 1 : delta < 0 ? -1 : 0;

/**
 * The fields a re-plan depends on, in ONE place. It feeds both the effect's
 * dependency array and its dedupe key.
 *
 * CONSTRAINT — the two must stay one list. As separate hand-written lists they
 * can drift, and a field present in one but missing from the other is a
 * silently missed (or silently duplicated) re-plan: nothing throws, the deck
 * simply strands at the old target or restarts a ride from its own midpoint.
 */
const replanInputs = (state: CarouselState, isInstantMode: boolean) =>
  [
    state.layout.canSlide,
    state.layout.visibleSlidesCount,
    state.motionPhase,
    state.moveReason,
    state.virtualIndex,
    state.fromVirtualIndex,
    state.teleportVirtualIndex,
    state.isTeleportApproach,
    state.isRepeatedClickAdvance,
    state.gesture.pointerVelocity,
    state.gesture.uiVelocity,
    state.gesture.releasedAt,
    isInstantMode,
  ] as const;

const buildStartFromGesture = (
  state: CarouselState,
  launchPosition: number,
): MotionStart => ({
  // The COASTED launch point, not the recorded release point (see gesture.md).
  position: launchPosition,
  velocity: state.gesture.uiVelocity,
  strategy: "gesture",
});

const buildStartFromState = (
  state: CarouselState,
  fallbackVelocity: number,
): MotionStart => ({
  position: state.fromVirtualIndex,
  velocity: fallbackVelocity,
  strategy: "step",
});

export function useMotionRunner({
  state,
  config,
  controller,
  isInstantMode,
  startCompositorMotion,
  cancelCompositorMotion,
  publishPlan,
  onSettle,
}: UseMotionRunnerInput): void {
  const lastKeyRef = useRef<string>("");

  const settle = useCallback(
    (sample: MotionSample<CarouselMotionStrategy>) => {
      onSettle(sample.value);
    },
    [onSettle],
  );

  const inputs = replanInputs(state, isInstantMode);

  useIsomorphicLayoutEffect(() => {
    const key = inputs.join(":");

    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (!state.layout.canSlide) {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, { strategy: "idle" });
      publishPlan({ kind: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, { strategy: "idle" });
      publishPlan({ kind: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      // Freeze the compositor at the live sample so the finger owns the track.
      cancelCompositorMotion(controller.getSnapshot().value);
      publishPlan({ kind: "follow", isFallback: false });
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelCompositorMotion(state.virtualIndex);
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
      });
      publishPlan({
        kind: "instant",
        direction: directionOf(state.virtualIndex - state.fromVirtualIndex),
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
        publishPlan({ kind: "idle" });
        return;
      }

      const { segment } = buildCarouselSegment({
        state,
        config,
        isInstantMode,
        start: resolvedStart,
        startedAt: resolvedStartedAt,
      });

      // One percent-progress curve per segment, shared by track and widget.
      const stops = profileProgressStops(
        segment.profile,
        segment.to - segment.from,
      );

      const isComposited = startCompositorMotion({
        from: segment.from,
        to: segment.to,
        duration: segment.duration,
        stops,
        startedAt: segment.startedAt,
      });

      if (!isComposited) {
        cancelCompositorMotion(resolvedStart.position);
      }

      // The controller runs every segment (the SSOT); passively when composited,
      // so a ride leaves the main thread idle (see motion.md).
      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
        isPassive: isComposited,
      });

      if (!isComposited) {
        // Legacy fallback: consumers follow the visual stream per frame.
        publishPlan({ kind: "follow", isFallback: true });
        return;
      }

      // A preflight plans the WHOLE command (preflight + approach) for one-step
      // consumers, re-authored over one unit step (see motion.md).
      const isPreflight = state.teleportVirtualIndex !== null;
      let planDuration = segment.duration;
      let planStops: readonly number[] = stops;

      if (isPreflight) {
        const stepSize = state.layout.visibleSlidesCount;
        const jumpPeak = resolveJumpPeakSpeed(
          stepSize,
          config.stepDuration,
          config.motion.goToSpeedMultiplier,
        );
        const totalDuration =
          segment.duration +
          resolveGoToApproachDuration(stepSize, config.motion, jumpPeak);
        const unitPeak = resolvePeakSpeedForDuration({
          distance: 1,
          duration: totalDuration,
          startSpeed: 0,
          accelerationDistanceShare:
            config.motion.goToAccelerationDistanceShare,
          decelerationDistanceShare:
            config.motion.goToDecelerationDistanceShare,
        });
        const unitProfile = buildProfile({
          from: 0,
          to: 1,
          startSpeed: 0,
          peakSpeed: unitPeak,
          endSpeed: 0,
          accelerationDistanceShare:
            config.motion.goToAccelerationDistanceShare,
          decelerationDistanceShare:
            config.motion.goToDecelerationDistanceShare,
        });
        planStops = profileProgressStops(unitProfile, 1);
        planDuration = unitProfile.duration;
      }

      publishPlan({
        kind: "waapi",
        direction: directionOf(segment.to - segment.from),
        duration: planDuration,
        stops: planStops,
        startedAt: resolvedStartedAt,
        targetKey: state.teleportVirtualIndex ?? state.virtualIndex,
        isContinuation: state.isTeleportApproach,
        isJump: segment.strategy === "jump",
      });
    };

    if (controller.isActive()) {
      // Atomic in-flight handoff — one sample gives position + velocity + time.
      const handoff = controller.captureHandoff(motionNow());
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

    const startedAt = motionNow();

    if (state.moveReason === "gesture") {
      const handoff = controller.captureHandoff(startedAt);
      const launchPosition = resolveCoastedLaunchPosition({
        livePosition: handoff.position,
        releaseVelocity: state.gesture.uiVelocity,
        releasedAt: state.gesture.releasedAt,
        now: startedAt,
        maxCoastMs: config.gestureCoastMaxMs,
        targetVirtualIndex: state.virtualIndex,
      });
      startResolvedMotion(
        buildStartFromGesture(state, launchPosition),
        startedAt,
      );
      return;
    }

    // Cold start: origin from the reducer, only residual velocity from the
    // controller — an intentional split, not a mixed handoff (see motion.md).
    const handoff = controller.captureHandoff(startedAt);
    startResolvedMotion(
      buildStartFromState(state, handoff.velocity),
      startedAt,
    );
    // `state` is read whole inside, but only `replanInputs` may RE-RUN this:
    // config/controller identity changes must not restart a live segment, and
    // the key above stops them at the door.
  }, [
    cancelCompositorMotion,
    config,
    controller,
    publishPlan,
    settle,
    startCompositorMotion,
    ...inputs,
  ]);

  useEffect(
    () => () => {
      cancelCompositorMotion(controller.getSnapshot().value);
      controller.cancel();
    },
    [cancelCompositorMotion, controller],
  );
}
