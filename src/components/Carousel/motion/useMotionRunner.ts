import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionClockStart,
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
 * Number of rAF ticks the runner waits before actually starting a new motion
 * segment — applied symmetrically to both a fresh cold start (from idle) and
 * a hot retarget (when a click lands during in-flight motion).
 *
 * Why the defer matters for both paths:
 *
 * - **Cold start.** The same React commit that flips `motionPhase` from
 *   "idle" to "step-normal" can mount many new SlideItems into the expanded
 *   render window. Each new `<img>` triggers a fresh decode and a heavy
 *   paint pass that on mobile can stall the browser for 100–300 ms. If the
 *   segment clock starts inside that layout effect, the controller's first
 *   rAF tick lands AFTER the heavy paint with `elapsed ≈ commit-paint
 *   duration`, and the user sees the track snap forward 20–30 px before
 *   motion continues at normal speed. Deferring the start to a rAF that
 *   fires AFTER the commit's paint pipeline has reached the compositor
 *   makes the segment's first observable frame be `progress = 0` (the
 *   resting `from` position), and every subsequent tick is one frame
 *   apart — no catch-up jump on the first visible frame.
 *
 * - **Hot retarget.** The old segment keeps painting during the defer
 *   window; at the boundary, the successor segment starts from one atomic
 *   `captureHandoff` point of the old curve, so position and velocity are
 *   read from the same sample at the same instant.
 *
 * Two rAFs is a defensive choice: a single rAF strictly suffices to "wait
 * until the previous commit's paint is on the compositor", but two also
 * give async image decode a frame of headroom — which matters on mobile,
 * where the heavy commit-driven paint also kicks off WebP decodes that
 * complete asynchronously.
 */
const MOTION_START_FRAME_DELAY = 2;

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
 * Every transition from a non-motion phase (idle / dragging / step-instant)
 * into a continuous-motion phase (step-normal / step-snap / step-jump) is
 * deferred by `MOTION_START_FRAME_DELAY` rAF ticks before the segment is
 * actually started — both for a cold start from idle and for a hot retarget
 * over an in-flight segment. See the constant's docblock for why.
 *
 * Hot retargets keep the old segment painting through the defer window. At
 * the boundary, the successor segment starts from a single atomic
 * `controller.captureHandoff(t)` — a coherent `(position, velocity)` taken
 * from the *same* sample of the old curve. Position and velocity can no
 * longer be sourced from two different moments (see motion §4.2).
 *
 * Every segment — first click, repeated click, gesture release — drives
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
    (callback: (timestamp: number) => void) => {
      cancelDeferredStart();

      if (typeof window === "undefined") {
        callback(performance.now());
        return;
      }

      const token = startTokenRef.current;
      let framesLeft = MOTION_START_FRAME_DELAY;

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
    // For a cold start the handoff is consulted only for residual velocity
    // (position is owned by the reducer's `state.fromVirtualIndex`). The
    // handoff's timestamp is unused — the segment's `startedAt` comes from
    // the deferred rAF callback below.
    const coldHandoff = isActive
      ? null
      : controller.captureHandoff(performance.now());

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
      });
    };

    if (isActive) {
      // Hot retarget. The old segment was already publishing presentation-
      // aligned frames; the handoff position is what the user already sees,
      // so the new segment can start ticking from `handoff.timestamp`
      // immediately — `after-initial-frame` would only add an unnecessary
      // 16 ms "frozen at handoff" frame before the direction change.
      scheduleDeferredStart((retargetTimestamp) => {
        const handoff = controller.captureHandoff(retargetTimestamp);
        startResolvedMotion(
          {
            position: handoff.position,
            velocity: handoff.velocity,
            strategy: handoff.strategy,
          },
          handoff.timestamp,
          "immediate",
        );
      });
      return;
    }

    // Cold start from idle. Defer through the same window so the React
    // commit's paint pipeline (which often mounts new SlideItems and
    // triggers fresh image decodes — the dominant cost on mobile) reaches
    // the compositor BEFORE the segment clock starts ticking. `clockStart:
    // "after-initial-frame"` then absorbs any leftover first-paint delay
    // (async WebP decode racing the initial sample's compositor commit)
    // into the `from` plateau instead of into the first visible elapsed —
    // without it, the user sees a catch-up jump of 20-30 px on the first
    // observable frame. See `MOTION_START_FRAME_DELAY` and `MotionClockStart`
    // docblocks for the full failure-mode walk-through.
    scheduleDeferredStart((startedAt) => {
      if (state.moveReason === "gesture") {
        startResolvedMotion(
          buildStartFromGesture(state),
          startedAt,
          "after-initial-frame",
        );
        return;
      }
      // The logical origin is owned by the reducer
      // (`state.fromVirtualIndex`); only the residual velocity comes from the
      // controller. That cross-layer split is intentional — not a mixed handoff.
      startResolvedMotion(
        buildStartFromState(state, coldHandoff?.velocity ?? 0),
        startedAt,
        "after-initial-frame",
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
