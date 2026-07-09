import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { CarouselState } from "../state";
import type { MotionPlanChannel, MotionPlanDirection } from "./planChannel";
import { buildProfile } from "./profile";
import {
  isLinearEasingSupported,
  profileProgressStops,
  resolvePeakSpeedForDuration,
  stopsToLinearEasing,
} from "./progressCurve";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";
import { resolveGoToApproachDuration, resolveJumpPeakSpeed } from "./timing";
import type { CarouselMotionStrategy, MotionStart } from "./types";

interface UseMotionRunnerInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  controller: MotionController<CarouselMotionStrategy>;
  isInstantMode: boolean;
  isDragging: boolean;
  enabled: boolean;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  /** Publishes the computed motion plan to paint consumers (widget). */
  publishPlan: MotionPlanChannel["publish"];
  /**
   * Called by the controller when a segment naturally settles. The argument
   * is the visual position where it settled, so the reducer can distinguish
   * a finished current target from an older target that settled after a newer
   * click had already been queued.
   */
  onSettle: (settledPosition: number) => void;
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const directionOf = (delta: number): MotionPlanDirection =>
  delta > 0 ? 1 : delta < 0 ? -1 : 0;

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
  strategy: "step",
});

/**
 * The motion runner is the only bridge between logical state and the motion
 * controller — and the single place the motion math is computed.
 *
 * Every motion is one accel/cruise/decel profile. The runner builds the
 * segment, serialises its percent-progress curve to a CSS `linear()` easing,
 * and hands the SAME plan to every paint consumer: the track gets it through
 * `startCompositorMotion` (a WAAPI animation over the segment's pixel
 * distance), the pagination widget gets it through the plan channel (a WAAPI
 * animation over one dot step). Same duration, same easing, same `startedAt`
 * clock — synchronized by construction, zero per-frame work while animating.
 *
 * The JS motion controller still samples every segment: it stays the
 * visual-position SSOT for handoff, settle, status, and the per-frame FOLLOW
 * mode (finger drag, or the fallback when `linear()` easing is unsupported —
 * in both, consumers track the visual stream frame by frame).
 *
 * In-flight handoffs are taken as a single atomic `controller.captureHandoff`
 * — a coherent `(position, velocity)` from one sample of the old curve — and
 * a retarget rebuilds synchronously in the commit: the previous WAAPI
 * animation keeps painting until the new one replaces it, so the rebuild cost
 * never shows on screen.
 */
export function useMotionRunner({
  state,
  config,
  controller,
  isInstantMode,
  isDragging,
  enabled,
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
      // A drag re-takes the track directly through the visual-position stream;
      // freeze the compositor at the live sample so the finger owns it again.
      cancelCompositorMotion(controller.getSnapshot().value);
      publishPlan({ kind: "follow" });
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
        isDragging,
        start: resolvedStart,
        startedAt: resolvedStartedAt,
      });

      // One percent-progress curve per segment: the track consumes it below,
      // the widget receives the same curve through the plan.
      const stops = profileProgressStops(segment.profile, segment.to - segment.from);
      const easing = stopsToLinearEasing(stops);

      const isComposited =
        isLinearEasingSupported() &&
        startCompositorMotion({
          from: segment.from,
          to: segment.to,
          duration: segment.duration,
          easing,
          startedAt: segment.startedAt,
        });

      if (!isComposited) {
        cancelCompositorMotion(resolvedStart.position);
      }

      // The controller runs regardless of compositing: it remains the SSOT for
      // status, handoff, settle, and the follow-mode stream. When composited,
      // its per-frame samples simply do not reach the track DOM.
      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });

      if (!isComposited) {
        // JS fallback: consumers follow the visual stream per frame.
        publishPlan({ kind: "follow" });
        return;
      }

      // A far-GO_TO preflight plans the WHOLE command for one-step consumers:
      // total duration spans preflight + approach, and the curve is the same
      // GO_TO shape re-authored over one unit step. The approach slice then
      // arrives flagged as a continuation and is ignored by them.
      const isPreflight = state.teleportVirtualIndex !== null;
      let planDuration = segment.duration;
      let planStops: readonly number[] = stops;
      let planEasing = easing;

      if (isPreflight) {
        const stepSize = state.layout.visibleSlidesCount;
        const jumpPeak = resolveJumpPeakSpeed(
          stepSize,
          config.stepDuration,
          config.jumpSpeedMultiplier,
        );
        const totalDuration =
          segment.duration +
          resolveGoToApproachDuration(stepSize, config.motion, jumpPeak);
        const unitPeak = resolvePeakSpeedForDuration({
          distance: 1,
          duration: totalDuration,
          startSpeed: 0,
          accelerationDistanceShare: config.motion.goToAccelerationDistanceShare,
          decelerationDistanceShare: config.motion.goToDecelerationDistanceShare,
        });
        const unitProfile = buildProfile({
          from: 0,
          to: 1,
          startSpeed: 0,
          peakSpeed: unitPeak,
          endSpeed: 0,
          accelerationDistanceShare: config.motion.goToAccelerationDistanceShare,
          decelerationDistanceShare: config.motion.goToDecelerationDistanceShare,
        });
        planStops = profileProgressStops(unitProfile, 1);
        planEasing = stopsToLinearEasing(planStops);
        planDuration = unitProfile.duration;
      }

      publishPlan({
        kind: "waapi",
        direction: directionOf(segment.to - segment.from),
        duration: planDuration,
        easing: planEasing,
        stops: planStops,
        startedAt: resolvedStartedAt,
        targetKey: state.teleportVirtualIndex ?? state.virtualIndex,
        isContinuation: state.isTeleportApproach,
      });
    };

    if (controller.isActive()) {
      // Atomic in-flight handoff: position + velocity + time from one sample
      // of the curve that is painting now. The rebuild happens synchronously
      // in this commit — the old compositor animation carries the pixels
      // until the new one replaces it.
      const handoff = controller.captureHandoff(now());
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

    const startedAt = now();

    if (state.moveReason === "gesture") {
      startResolvedMotion(buildStartFromGesture(state), startedAt);
      return;
    }

    // Cold start from idle: the logical origin is owned by the reducer
    // (`state.fromVirtualIndex`); only the residual velocity comes from the
    // controller snapshot. That cross-layer split is intentional — not a
    // mixed handoff.
    const handoff = controller.captureHandoff(startedAt);
    startResolvedMotion(buildStartFromState(state, handoff.velocity), startedAt);
  }, [
    cancelCompositorMotion,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    publishPlan,
    settle,
    startCompositorMotion,
    state.fromVirtualIndex,
    state.gesture.pointerVelocity,
    state.gesture.uiVelocity,
    state.isTeleportApproach,
    state.isRepeatedClickAdvance,
    state.layout.visibleSlidesCount,
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
