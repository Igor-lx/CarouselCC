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
  /** Called by the controller when a segment naturally settles. The argument
   *  is the visual position at which it settled — required by the reducer to
   *  resolve the MOTION_SETTLED transition when the user changed the target
   *  during the motion. */
  onSettle: (settledPosition: number) => void;
  onDurationChange?: (duration: number) => void;
}

/**
 * Number of RAF ticks the runner waits before swapping the active segment
 * for a click that lands during motion. The old segment keeps painting
 * during this window. At the deferred boundary we read the just-emitted
 * visual position and the instantaneous velocity of the old curve and start
 * the new segment from there. Two frames is the empirical sweet spot:
 * enough that React's commit + composite for the dispatch fully flushes and
 * the visual stream is continuous, short enough that the user can't
 * perceive the latency.
 */
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

/**
 * The motion runner is the one bridge between logical state and the motion
 * controller. On every state transition that requires animation it:
 *
 * 1. records the new intent in state *immediately*;
 * 2. for a mid-flight handoff (`isActive` — repeated click, opposite-
 *    direction click, any interruption), defers the controller retarget by
 *    `RETARGET_FRAME_DELAY` RAFs so the old segment keeps emitting and the
 *    DOM stream stays continuous;
 * 3. at the deferred boundary, samples *position from the last emitted
 *    visual frame* (`controller.getSnapshot()`) and *velocity from a fresh
 *    re-sample of the old curve* (`controller.read(retargetTimestamp)`);
 * 4. builds the segment with `startedAt = retargetTimestamp` so the initial
 *    emit equals the already-painted position — a DOM no-op.
 *
 * The two-source split (position cached, velocity fresh) is intentional:
 * — Using a freshly re-sampled position can leave the new segment ahead of
 *   what subscribers have painted; the controller would then publish that
 *   ahead-value and the eye reads it as a forward jump on click.
 * — Using a stale velocity (last emit, up to 16 ms old) would make the
 *   profile's `startSpeed` lag behind the real instantaneous derivative,
 *   producing a momentary deceleration the user reads as a hiccup.
 *
 * Every segment — first click, repeated click, gesture release — drives
 * straight to `state.virtualIndex` (the page boundary) and decays to zero
 * speed. There is no intermediate target and no chained follow-up segment.
 *
 * Other branches:
 *   - `gesture` (post-release): the position lives on the state from
 *     END_DRAG; the segment starts there.
 *   - default (cold idle → moving, or post-MOTION_SETTLED re-target): start
 *     from the state-canonical `fromVirtualIndex`.
 */
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
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "idle") {
      cancelDeferredRetarget();
      controller.snap(state.virtualIndex, { strategy: "idle" });
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "dragging") {
      // Drag is owned by the gesture adapter, which writes through
      // `applyImmediatePosition`. That call already cancels any prior motion
      // and emits the new value on the visual position stream, so the runner
      // has nothing to do here besides aborting any pending retarget.
      cancelDeferredRetarget();
      onDurationChange?.(0);
      return;
    }

    if (state.motionPhase === "step-instant") {
      cancelDeferredRetarget();
      controller.snap(state.virtualIndex, {
        strategy: "idle",
        onComplete: settle,
      });
      onDurationChange?.(0);
      return;
    }

    // From here on we are starting a real animation segment.
    const startedNow = performance.now();
    const isActive = controller.isActive();
    // For the !isActive branches we need a velocity hint. Reading at
    // `startedNow` is fine because the controller is settled — `read` just
    // returns the stored sample without doing any segment math.
    const currentSample = isActive ? null : controller.read(startedNow);

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
        onDurationChange?.(0);
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

      onDurationChange?.(duration);

      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });
    };

    if (isActive) {
      // Mid-flight handoff (repeated click, opposite-direction click, any
      // interruption). Defer two RAFs, then start the new segment from the
      // emitted visual position with the fresh curve velocity. See header
      // docstring for the two-source rationale.
      scheduleDeferredRetarget((retargetTimestamp) => {
        const retargetVisualSample = controller.getSnapshot();
        const retargetVelocitySample = controller.read(retargetTimestamp);
        const retargetStart = buildStartFromVisualHandoff(
          retargetVisualSample,
          retargetVelocitySample,
        );
        startResolvedMotion(retargetStart, retargetTimestamp);
      });
      return;
    }

    cancelDeferredRetarget();

    if (state.moveReason === "gesture") {
      // Post-release segment. Origin and release velocity come from the
      // END_DRAG payload (canonical), not the controller — drag emissions
      // carry no velocity by design.
      startResolvedMotion(buildStartFromGesture(state), startedNow);
      return;
    }

    // Either:
    //  - idle → moving (state.fromVirtualIndex was written from the cold
    //    visual read at dispatch time);
    //  - post-MOTION_SETTLED re-targeting (reducer re-anchored
    //    fromVirtualIndex to the actual settled position when the user
    //    changed the target during motion).
    // In both cases `state.fromVirtualIndex` is the canonical origin.
    startResolvedMotion(
      buildStartFromState(state, currentSample?.velocity ?? 0),
      startedNow,
    );
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
