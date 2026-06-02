import { useCallback, useEffect, useRef } from "react";

import {
  useIsomorphicLayoutEffect,
  type MotionController,
  type MotionSample,
} from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { MotionPlanSource } from "../position";
import type { CarouselState } from "../state";
import { bezierToCss } from "./bezier";
import { canUseCompositorTrackMotion } from "./compositorEligibility";
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
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  /**
   * Compositor motion-plan mirror. The runner publishes the eased segment here
   * when (and only when) it drives that segment on the compositor, and clears
   * it (`null`) on every other transition (profile segment, snap, drag, idle),
   * so compositor mirrors animate exactly the curve that is composited.
   */
  motionPlan: MotionPlanSource;
  /** Live slot count, to express the plan in the page-offset domain. */
  visibleSlidesCount: number;
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

const requestFrame = (callback: () => void): number | null =>
  typeof window === "undefined" ? null : window.requestAnimationFrame(callback);

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
 * gesture/profile math, the pagination widget, status snapshots, handoff, and
 * settle all read its sampled timeline. An `EasingSegment` (click, autoplay,
 * snap-back, non-inertial gesture release) *additionally* runs the identical
 * translation through the Web Animations API, so the deck translation lives on
 * the compositor thread while the JS sampler keeps publishing the authoritative
 * numbers to the non-track subscribers (see `canUseCompositorTrackMotion`). The
 * track binding skips its own per-frame transform write while a compositor
 * animation is live, so the two never fight. `ProfileSegment`s (inertial
 * gesture release, repeated-click, GO_TO jump) run fully on the JS sampler.
 *
 * In-flight handoffs are taken as a single atomic `controller.captureHandoff(t)`
 * — a coherent `(position, velocity)` from one sample of the old curve. Every
 * segment drives directly to `state.virtualIndex`; there is no intermediate
 * destination or chained follow-up segment.
 *
 * Same-direction repeated clicks rebuild a `ProfileSegment`, which is the
 * heaviest work the runner does and cannot be masked by the compositor. Since
 * such a click only arrives while the deck is already moving, the rebuild is
 * held `repeatedClick.retargetFrameDelay` frames — the current segment keeps
 * painting meanwhile — so that compute leaves the input tick. The handoff is
 * still captured atomically, but at the deferred boundary, from whatever curve
 * is actually painting then.
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
  motionPlan,
  visibleSlidesCount,
  onSettle,
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
    (frames: number, run: () => void) => {
      cancelDeferredRetarget();
      if (typeof window === "undefined") {
        run();
        return;
      }
      const token = retargetTokenRef.current;
      let framesLeft = frames;
      const tick = () => {
        if (retargetTokenRef.current !== token) return;
        framesLeft -= 1;
        if (framesLeft > 0) {
          retargetFrameRef.current = requestFrame(tick);
          return;
        }
        retargetFrameRef.current = null;
        run();
      };
      retargetFrameRef.current = requestFrame(tick);
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

    // Any newly-committed state supersedes a pending deferred retarget.
    cancelDeferredRetarget();
    // Any non-composited transition clears the plan; the composited easing path
    // below re-publishes it. Mirrors then follow the per-frame stream meanwhile.
    motionPlan.publish(null);

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
      // A drag re-takes the track directly through the visual-position stream;
      // freeze the compositor at the live sample so the finger owns it again.
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
        motionPlan.publish(null);
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

      // Try to drive an eligible easing segment on the compositor. When it
      // takes, the track binding suppresses its own per-frame writes; when it
      // does not (profile segment, no slot measured, no `Element.animate`),
      // make sure no stale compositor animation is left running over the JS
      // path.
      const isComposited =
        canUseCompositorTrackMotion(segment) &&
        startCompositorMotion({
          from: segment.from,
          to: segment.to,
          duration: segment.duration,
          easing: bezierToCss(segment.easing),
        });

      if (isComposited) {
        // Mirror the exact composited easing curve for the other compositor
        // consumers (the pagination widget), in the page-offset domain. Only
        // when truly composited: a JS-path segment is followed per-frame.
        const slot = visibleSlidesCount > 0 ? visibleSlidesCount : 1;
        motionPlan.publish({
          fromPageOffset: segment.from / slot,
          toPageOffset: segment.to / slot,
          duration: segment.duration,
          easing: segment.easing,
        });
      } else {
        cancelCompositorMotion(resolvedStart.position);
        motionPlan.publish(null);
      }

      // The controller runs regardless of compositing: it remains the SSOT for
      // pagination, status, handoff, and settle. When composited, its
      // per-frame samples simply do not reach the track DOM.
      controller.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: settle,
      });
    };

    // Atomic in-flight handoff: position + velocity + time from one sample of
    // the curve that is painting *now* (which, when deferred, is the boundary).
    const startActiveRetarget = () => {
      if (!controller.isActive()) return;
      const handoff = controller.captureHandoff(now());
      startResolvedMotion(
        {
          position: handoff.position,
          velocity: handoff.velocity,
          strategy: handoff.strategy,
        },
        handoff.timestamp,
      );
    };

    if (controller.isActive()) {
      const retargetDelay = config.repeatedClick.retargetFrameDelay;
      if (state.isRepeatedClickAdvance && retargetDelay > 0) {
        scheduleDeferredRetarget(retargetDelay, startActiveRetarget);
        return;
      }
      startActiveRetarget();
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
    cancelDeferredRetarget,
    config,
    controller,
    enabled,
    isDragging,
    isInstantMode,
    motionPlan,
    scheduleDeferredRetarget,
    settle,
    startCompositorMotion,
    visibleSlidesCount,
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
      cancelDeferredRetarget();
      cancelCompositorMotion(controller.getSnapshot().value);
      controller.cancel();
      motionPlan.publish(null);
    },
    [cancelCompositorMotion, cancelDeferredRetarget, controller, motionPlan],
  );
}
