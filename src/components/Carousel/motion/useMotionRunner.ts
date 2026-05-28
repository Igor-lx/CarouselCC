import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import { traceCarousel } from "../debug/performanceTrace";
import type { CarouselState } from "../state";
import { bezierToCss } from "./bezier";
import { buildCarouselSegment } from "./segmentFactory";
import { sampleCarouselSegment } from "./sampler";
import type {
  CarouselMotionStrategy,
  CarouselSegment,
  EasingSegment,
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

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Only a plain `easing` step (click / autoplay / snap-back, a fixed
 * cubic-bezier translation of the whole track) can be expressed as a single
 * WAAPI keyframe pair and handed to the compositor. Profile segments
 * (`gesture`, `repeated`, `jump`) carry speed-authored accel/cruise/decel
 * shapes, teleport discontinuities, or inertial velocity that a single CSS
 * easing curve cannot reproduce — they stay on the JS sampler. `gesture-easing`
 * (a non-inertial release) also stays JS-driven for continuity with the live
 * drag position.
 */
const isCompositorTrackSegment = (
  segment: CarouselSegment,
): segment is EasingSegment => segment.strategy === "easing";

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
 * The JS motion controller stays the visual-position SSOT for every consumer:
 * gesture/profile math, diagnostics, the pagination widget, status snapshots,
 * handoff, and settle all read its sampled timeline. For a plain easing step
 * the track DOM *additionally* runs the identical transform through the Web
 * Animations API, so the deck translation lives on the compositor thread while
 * the JS sampler keeps publishing the authoritative numbers to the non-track
 * subscribers. The track binding skips its own per-frame transform write while
 * a compositor animation is live (see `useTrackBinding.writePosition`), so the
 * two never fight.
 *
 * Profile segments (gesture release, repeated-click, GO_TO jump) are not
 * compositor-eligible and run fully on the JS sampler as before.
 *
 * Hot retargets hand off at a single atomic `controller.captureHandoff(t)` —
 * a coherent `(position, velocity)` taken from the same sample of the old
 * curve (see motion §4.2). Every segment drives directly to
 * `state.virtualIndex`; there is no intermediate destination or chained
 * follow-up segment.
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
    traceCarousel("motion:layoutEffect", {
      enabled,
      fromVirtualIndex: state.fromVirtualIndex,
      isDragging,
      isInstantMode,
      motionPhase: state.motionPhase,
      moveReason: state.moveReason,
      targetVirtualIndex: state.virtualIndex,
      teleportVirtualIndex: state.teleportVirtualIndex,
    });

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
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "idle") {
      cancelCompositorMotion(state.virtualIndex);
      onAutoplayDurationCancel?.();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      return;
    }

    if (state.motionPhase === "dragging") {
      // A drag re-takes the track directly through the visual-position stream;
      // freeze the compositor at the live sample so the finger owns it again.
      cancelCompositorMotion(controller.getSnapshot().value);
      onAutoplayDurationCancel?.();
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelCompositorMotion(state.virtualIndex);
      onAutoplayDurationCancel?.();
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

      // Try to drive a plain easing step on the compositor. When it takes,
      // the track binding suppresses its own per-frame writes; when it does
      // not (profile segment, no slot measured, no `Element.animate`), make
      // sure no stale compositor animation is left running over the JS path.
      const isComposited =
        isCompositorTrackSegment(segment) &&
        startCompositorMotion({
          from: segment.from,
          to: segment.to,
          duration: segment.duration,
          easing: bezierToCss(segment.easing),
        });

      if (!isComposited) {
        cancelCompositorMotion(resolvedStart.position);
      }

      traceCarousel("motion:start", {
        composited: isComposited,
        duration,
        from: segment.from,
        startedAt: segment.startedAt,
        strategy: segment.strategy,
        to: segment.to,
      });

      // The controller runs regardless of compositing: it remains the SSOT for
      // pagination, status, handoff, and settle. When composited, its
      // per-frame samples simply do not reach the track DOM.
      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });
    };

    const startedAt = now();

    if (controller.isActive()) {
      // One atomic point: position + velocity + time from the same sample.
      const handoff = controller.captureHandoff(startedAt);
      traceCarousel("motion:handoff", {
        position: handoff.position,
        strategy: handoff.strategy,
        timestamp: handoff.timestamp,
        velocity: handoff.velocity,
      });
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
    onAutoplayDurationCancel,
    onAutoplayDurationChange,
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
