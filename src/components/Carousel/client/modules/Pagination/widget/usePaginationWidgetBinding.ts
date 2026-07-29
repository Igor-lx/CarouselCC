// See docs/architecture/modules.md
import { useCallback, useEffect, useRef } from "react";

import {
  motionNow,
  resampleStops,
  useIsomorphicLayoutEffect,
} from "../../../../../../shared";
import {
  positionAtNow,
  startPinnedAnimation,
  type CarouselMotionPlan,
  type InFlightSpan,
  type MotionPlanSource,
  type WaapiMotionPlan,
} from "../../../motion";
import {
  isDroppedFallbackFrame,
  type VisualPositionSource,
} from "../../../visual-position";
// Per-frame write gates: within-epsilon values skip the DOM write, so a steady
// idle widget emits zero per-rAF writes.
const DOT_POSITION_EPSILON_PX = 0.25;
const DOT_SCALE_EPSILON = 0.002;
const DOT_OPACITY_EPSILON = 0.01;
import {
  widgetProjectionSide,
  widgetProjectionSlotCount,
} from "./math/spatialField";
import { writeDotProjection } from "./math/projection";
import {
  resolveWidgetStepTarget,
  WIDGET_STEP_LOOKAHEAD,
  type WidgetStepMemory,
} from "./stepTarget";
import {
  activeTrajectoryIds,
  sampleActiveDotTrajectory,
  sampleDotTrajectory,
} from "./math/trajectory";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

// The widget's decoupled one-step motion model. See docs/architecture/modules.md

/**
 * Extra dot elements beyond the resting window: `WIDGET_STEP_LOOKAHEAD` spare
 * slots on EACH side, because a step may land that far out in either direction.
 * Derived from the step cap, not chosen вЂ” the two cannot drift apart.
 */
export const DOT_COVERAGE_MARGIN_SLOTS = WIDGET_STEP_LOOKAHEAD * 2;

/**
 * Overlay elements. A step spans at most `WIDGET_STEP_LOOKAHEAD` from the live
 * offset, and `activeTrajectoryIds` brackets that span with a floor and a ceil,
 * so it can name one more id than the span itself.
 */
export const ACTIVE_DOT_COUNT = WIDGET_STEP_LOOKAHEAD + 2;

/** At or below this a dot paints nothing: pin it, don't pay for an invisible animation. */
const INVISIBLE_OPACITY_MAX = 0.001;

/** Strip plan-curve density вЂ” coarser than the track's (a dot travels в‰¤ a strip width). */
const STRIP_CURVE_INTERVALS = 32;

const emptyDotState = (): PaginationWidgetDotState => ({
  id: 0,
  x: 0,
  scale: 0,
  opacity: 0,
  activeStrength: 0,
  isActive: false,
});

const toTransform = (x: number, scale: number) =>
  `translate3d(${x}px, 0, 0) scale(${scale})`;



/** Caches the transform inputs (not the string) for the epsilon write gates. */
interface DotWriteCache {
  x: number;
  scale: number;
  opacity: number;
}

const shouldWriteTransform = (
  last: DotWriteCache | null,
  x: number,
  scale: number,
): boolean =>
  last === null ||
  Math.abs(last.x - x) >= DOT_POSITION_EPSILON_PX ||
  Math.abs(last.scale - scale) >= DOT_SCALE_EPSILON;

const shouldWriteOpacity = (
  last: DotWriteCache | null,
  opacity: number,
): boolean => last === null || Math.abs(last.opacity - opacity) >= DOT_OPACITY_EPSILON;

/** An in-flight WAAPI step: the plan span plus the widget's direction/key/animations. */
interface ActiveStep extends InFlightSpan {
  direction: -1 | 0 | 1;
  targetKey: number;
  animations: Animation[];
}

interface UseBindingInput {
  visualPosition: VisualPositionSource | null;
  motionPlan: MotionPlanSource | null;
  geometry: PaginationWidgetGeometry;
  activeClassName?: string;
}

export interface PaginationWidgetBinding {
  bindDotRef: (index: number) => (node: HTMLDivElement | null) => void;
  bindActiveDotRef: (index: number) => (node: HTMLDivElement | null) => void;
  slotCount: number;
  activeDotCount: number;
}

export function usePaginationWidgetBinding({
  visualPosition,
  motionPlan,
  geometry,
  activeClassName,
}: UseBindingInput): PaginationWidgetBinding {
  const dotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeDotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dotCallbacksRef = useRef<
    Array<((node: HTMLDivElement | null) => void) | null>
  >([]);
  const activeDotCallbacksRef = useRef<
    Array<((node: HTMLDivElement | null) => void) | null>
  >([]);
  const dotCacheRef = useRef<Array<DotWriteCache | null>>([]);
  const activeDotCacheRef = useRef<Array<DotWriteCache | null>>([]);
  const projectionRef = useRef<PaginationWidgetDotState>(emptyDotState());
  const activeProjectionRef = useRef<PaginationWidgetDotState>(emptyDotState());
  const appliedActiveClassNameRef = useRef<string | null>(null);

  /** The widget's own step counter вЂ” where the strip logically sits. */
  const offsetRef = useRef(0);
  const stepRef = useRef<ActiveStep | null>(null);
  /** The step a finger grab tore down вЂ” so a repeat swipe advances one step BEYOND. */
  const interruptedStepRef = useRef<WidgetStepMemory | null>(null);
  const followUnsubRef = useRef<(() => void) | null>(null);
  const followBaseRef = useRef<{ pageOffset: number; offset: number } | null>(
    null,
  );
  /** Which follow the live subscription is serving. A drag that releases into the
   * no-WAAPI path switches flavour WITHOUT a new subscription, and the frame-drop
   * rule has to switch with it or the strip outruns the track. */
  const isFallbackFollowRef = useRef(false);

  const side = widgetProjectionSide(geometry.visibleCount);
  const dotCount = widgetProjectionSlotCount(geometry.visibleCount) + DOT_COVERAGE_MARGIN_SLOTS;
  const activeSlotIndex = side + DOT_COVERAGE_MARGIN_SLOTS / 2;

  const bindDotRef = useCallback((index: number) => {
    const cached = dotCallbacksRef.current[index];
    if (cached) return cached;
    const callback = (node: HTMLDivElement | null) => {
      dotRefs.current[index] = node;
    };
    dotCallbacksRef.current[index] = callback;
    return callback;
  }, []);

  const bindActiveDotRef = useCallback((index: number) => {
    const cached = activeDotCallbacksRef.current[index];
    if (cached) return cached;
    const callback = (node: HTMLDivElement | null) => {
      activeDotRefs.current[index] = node;
    };
    activeDotCallbacksRef.current[index] = callback;
    return callback;
  }, []);

  useIsomorphicLayoutEffect(() => {
    dotCacheRef.current = new Array<DotWriteCache | null>(dotCount).fill(null);
    activeDotCacheRef.current = new Array<DotWriteCache | null>(
      ACTIVE_DOT_COUNT,
    ).fill(null);
    dotRefs.current.length = dotCount;
    dotCallbacksRef.current.length = dotCount;
    activeDotRefs.current.length = ACTIVE_DOT_COUNT;
    activeDotCallbacksRef.current.length = ACTIVE_DOT_COUNT;
  }, [dotCount]);

  useIsomorphicLayoutEffect(() => {
    const previousActiveClassName = appliedActiveClassNameRef.current;

    for (let index = 0; index < dotCount; index += 1) {
      const dot = dotRefs.current[index];
      if (!dot) continue;
      if (previousActiveClassName && previousActiveClassName !== activeClassName) {
        dot.classList.remove(previousActiveClassName);
      }
      if (!activeClassName) continue;
      if (index === activeSlotIndex) dot.classList.add(activeClassName);
      else dot.classList.remove(activeClassName);
    }
    appliedActiveClassNameRef.current = activeClassName ?? null;
  }, [activeClassName, activeSlotIndex, dotCount]);

  // ---- static / follow write path (per-frame or one-shot) -------------------

  const invalidateWriteCaches = useCallback(() => {
    dotCacheRef.current.fill(null);
    activeDotCacheRef.current.fill(null);
  }, []);

  const writeActiveProjection = useCallback(
    (visualOffset: number) => {
      const floorId = Math.floor(visualOffset);
      const ceilId = Math.ceil(visualOffset);
      const cache = activeDotCacheRef.current;

      for (let index = 0; index < ACTIVE_DOT_COUNT; index += 1) {
        const dot = activeDotRefs.current[index];
        if (!dot) continue;

        // Two live overlays (floor/ceil); coverage extras stay hidden.
        const id = index === 0 ? floorId : index === 1 ? ceilId : null;
        const isDuplicate = index === 1 && ceilId === floorId;
        const state =
          id !== null && !isDuplicate
            ? writeDotProjection(activeProjectionRef.current, id, visualOffset, geometry)
            : null;
        const x = state?.x ?? 0;
        const scale = state?.scale ?? 0;
        const opacity = state?.activeStrength ?? 0;
        const last = cache[index];
        if (opacity === 0 && last !== null && last.opacity === 0) continue;

        const transformChanged = shouldWriteTransform(last, x, scale);
        const opacityChanged = shouldWriteOpacity(last, opacity);

        if (transformChanged) {
          dot.style.transform = toTransform(x, scale);
        }
        if (opacityChanged) {
          dot.style.opacity = String(opacity);
        }

        if (last === null) cache[index] = { x, scale, opacity };
        else {
          if (transformChanged) {
            last.x = x;
            last.scale = scale;
          }
          if (opacityChanged) last.opacity = opacity;
        }
      }
    },
    [geometry],
  );

  const writeOffset = useCallback(
    (visualOffset: number) => {
      const firstId = Math.round(visualOffset) - side - DOT_COVERAGE_MARGIN_SLOTS / 2;
      const cache = dotCacheRef.current;

      for (let index = 0; index < dotCount; index += 1) {
        const dot = dotRefs.current[index];
        if (!dot) continue;

        const id = firstId + index;
        const state = writeDotProjection(projectionRef.current, id, visualOffset, geometry);
        const last = cache[index];

        if (state.opacity === 0 && last !== null && last.opacity === 0) continue;

        const transformChanged = shouldWriteTransform(last, state.x, state.scale);
        const opacityChanged = shouldWriteOpacity(last, state.opacity);

        if (transformChanged) {
          dot.style.transform = toTransform(state.x, state.scale);
        }
        if (opacityChanged) {
          dot.style.opacity = String(state.opacity);
        }
        if (last === null) {
          cache[index] = { x: state.x, scale: state.scale, opacity: state.opacity };
        } else {
          if (transformChanged) {
            last.x = state.x;
            last.scale = state.scale;
          }
          if (opacityChanged) last.opacity = state.opacity;
        }
      }

      writeActiveProjection(visualOffset);
    },
    [dotCount, geometry, side, writeActiveProjection],
  );

  // ---- WAAPI step mode -------------------------------------------------------

  // Live offset: mid-step sampled from the plan's curve, never the DOM.
  const currentOffset = useCallback(
    () =>
      stepRef.current
        ? positionAtNow(stepRef.current, motionNow())
        : offsetRef.current,
    [],
  );

  const cancelStepAnimations = useCallback(() => {
    const step = stepRef.current;
    if (!step) return;
    for (const animation of step.animations) {
      try {
        animation.cancel();
      } catch {
        // already gone
      }
    }
    stepRef.current = null;
  }, []);

  const finalizeStep = useCallback(
    (finalOffset: number) => {
      interruptedStepRef.current = null;
      cancelStepAnimations();
      offsetRef.current = finalOffset;
      invalidateWriteCaches(); // WAAPI owned the styles; caches are stale

      writeOffset(finalOffset);
    },
    [cancelStepAnimations, invalidateWriteCaches, writeOffset],
  );

  const startWaapiStep = useCallback(
    (plan: WaapiMotionPlan) => {
      if (plan.isContinuation && stepRef.current) return; // preflight already planned it

      const previous = stepRef.current;
      const from = currentOffset();

      // One rule for both memories: live step (click) + grab-interrupted (swipe).
      const interrupted = interruptedStepRef.current;
      interruptedStepRef.current = null;
      const target = resolveWidgetStepTarget({
        direction: plan.direction,
        targetKey: plan.targetKey,
        from,
        previous: previous
          ? {
              target: previous.to,
              direction: previous.direction,
              targetKey: previous.targetKey,
            }
          : null,
        interrupted,
      });

      cancelStepAnimations();
      invalidateWriteCaches();

      const animations: Animation[] = [];
      const stripStops = resampleStops(plan.stops, STRIP_CURVE_INTERVALS);
      const lowId =
        Math.floor(Math.min(from, target)) - side - DOT_COVERAGE_MARGIN_SLOTS / 2;

      // Curve + spatial path fold into one keyframe list per dot (no easing fn).
      for (let index = 0; index < dotCount; index += 1) {
        const dot = dotRefs.current[index];
        if (!dot) continue;
        const keyframes = sampleDotTrajectory(
          lowId + index,
          from,
          target,
          geometry,
          stripStops,
        );

        // A dot invisible all step is pinned (stays mounted), not animated.
        if (keyframes.every((frame) => frame.opacity <= INVISIBLE_OPACITY_MAX)) {
          const last = keyframes[keyframes.length - 1]!;
          dot.style.transform = last.transform;
          dot.style.opacity = String(last.opacity);
          continue;
        }

        const animation = startPinnedAnimation(dot, keyframes, {
          duration: plan.duration,
          startedAt: plan.startedAt,
        });
        if (!animation) continue;
        animations.push(animation);
      }

      const overlayIds = activeTrajectoryIds(from, target);
      for (let index = 0; index < ACTIVE_DOT_COUNT; index += 1) {
        const overlay = activeDotRefs.current[index];
        if (!overlay) continue;
        const id = overlayIds[index];
        if (id === undefined) {
          overlay.style.opacity = "0";
          continue;
        }
        const keyframes = sampleActiveDotTrajectory(
          id,
          from,
          target,
          geometry,
          stripStops,
        );
        // Same invisible-pin rule as the dots.
        if (keyframes.every((frame) => frame.opacity <= INVISIBLE_OPACITY_MAX)) {
          overlay.style.opacity = "0";
          continue;
        }
        const animation = startPinnedAnimation(overlay, keyframes, {
          duration: plan.duration,
          startedAt: plan.startedAt,
        });
        if (!animation) continue;
        animations.push(animation);
      }

      if (animations.length === 0) {
        // Nothing animatable: land directly on the target.
        offsetRef.current = target;
        writeOffset(target);
        return;
      }

      const step: ActiveStep = {
        from,
        to: target,
        direction: plan.direction,
        targetKey: plan.targetKey,
        duration: plan.duration,
        startedAt: plan.startedAt,
        stops: plan.stops,
        animations,
      };
      stepRef.current = step;

      animations[0]!.onfinish = () => {
        if (stepRef.current !== step) return;
        finalizeStep(step.to);
      };
    },
    [
      cancelStepAnimations,
      currentOffset,
      dotCount,
      finalizeStep,
      geometry,
      invalidateWriteCaches,
      side,
      writeOffset,
    ],
  );

  // ---- follow mode (finger drag / JS fallback) -------------------------------

  const stopFollowing = useCallback(() => {
    followUnsubRef.current?.();
    followUnsubRef.current = null;
    followBaseRef.current = null;
  }, []);

  const startFollowing = useCallback(
    (isFallback: boolean) => {
      isFallbackFollowRef.current = isFallback;
      if (followUnsubRef.current || !visualPosition) return;
      // Take over from the live offset; remember the step this grab tears down.
      const start = currentOffset();
      interruptedStepRef.current = stepRef.current
        ? {
            target: stepRef.current.to,
            direction: stepRef.current.direction,
            targetKey: stepRef.current.targetKey,
          }
        : null;
      cancelStepAnimations();
      invalidateWriteCaches();
      offsetRef.current = start;
      writeOffset(start);
      followBaseRef.current = null;

      followUnsubRef.current = visualPosition.subscribe(
        (frame) => {
          // Delta-follow in the widget's own step domain (epsilon-gated writes).
          if (followBaseRef.current === null) {
            followBaseRef.current = {
              pageOffset: frame.pageOffset,
              offset: offsetRef.current,
            };
          }
          const base = followBaseRef.current;
          const next = base.offset + (frame.pageOffset - base.pageOffset);
          offsetRef.current = next;

          // Fallback relief: same shared frame-drop rule as the track.
          if (isFallbackFollowRef.current && isDroppedFallbackFrame(frame)) return;
          writeOffset(next);
        },
        { emitCurrent: true },
      );
    },
    [
      cancelStepAnimations,
      currentOffset,
      invalidateWriteCaches,
      visualPosition,
      writeOffset,
    ],
  );

  // ---- plan routing -----------------------------------------------------------

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          stopFollowing();
          startWaapiStep(plan);
          return;
        }
        case "follow": {
          startFollowing(plan.isFallback);
          return;
        }
        case "instant": {
          stopFollowing();
          const landing = Math.round(currentOffset()) + plan.direction;
          finalizeStep(landing);
          return;
        }
        case "idle": {
          stopFollowing();
          if (stepRef.current) {
            finalizeStep(stepRef.current.to);
          }
          return;
        }
      }
    },
    [currentOffset, finalizeStep, startFollowing, startWaapiStep, stopFollowing],
  );

  useIsomorphicLayoutEffect(() => {
    // Initial static paint, then follow plans.
    invalidateWriteCaches();
    writeOffset(offsetRef.current);
    if (!motionPlan) return;

    const unsubscribe = motionPlan.subscribe(applyPlan);
    return () => {
      unsubscribe();
      stopFollowing();
      cancelStepAnimations();
    };
  }, [
    applyPlan,
    cancelStepAnimations,
    invalidateWriteCaches,
    motionPlan,
    stopFollowing,
    writeOffset,
  ]);

  useEffect(
    () => () => {
      stopFollowing();
      cancelStepAnimations();
    },
    [cancelStepAnimations, stopFollowing],
  );

  return {
    bindDotRef,
    bindActiveDotRef,
    slotCount: dotCount,
    activeDotCount: ACTIVE_DOT_COUNT,
  };
}
