import { useCallback, useEffect, useRef } from "react";

import { motionNow, useIsomorphicLayoutEffect } from "../../../../../shared";
import {
  sampleProgressStops,
  type CarouselMotionPlan,
  type MotionPlanSource,
  type WaapiMotionPlan,
} from "../../motion";
import {
  isDroppedFallbackFrame,
  type VisualPositionSource,
} from "../../visual-position";
import {
  DOT_OPACITY_EPSILON,
  DOT_POSITION_EPSILON_PX,
  DOT_SCALE_EPSILON,
} from "./defaults";
import {
  widgetProjectionSide,
  widgetProjectionSlotCount,
} from "./math/spatialField";
import { writeDotProjection } from "./math/projection";
import {
  activeTrajectoryIds,
  sampleActiveDotTrajectory,
  sampleDotTrajectory,
} from "./math/trajectory";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

/**
 * The widget's motion model (mirrors the deck's engine-first design):
 *
 * - The widget owns a decoupled step counter `offset` (float, unbounded). It
 *   never mirrors the deck's absolute position: a navigation command is one
 *   step forward or back, whether the deck travels one page or teleports ten.
 * - **WAAPI mode** (any engine-planned motion): the plan carries duration +
 *   the percent-progress stops of the deck's profile. Every dot gets ONE
 *   keyframe list folding both curves — the i-th keyframe is the dot's
 *   spatial projection at temporal progress `stops[i]` — pinned to the shared
 *   `startedAt` clock, so widget and deck run the same temporal curve over
 *   different distances, in phase, with zero per-frame work.
 * - **Follow mode** (finger on the deck, or the no-WAAPI legacy fallback):
 *   per-frame writes driven by the visual-position stream, delta-based
 *   (`offset` moves by the deck's page-offset delta), with epsilon write
 *   gates; in the fallback flavour the shared frame-skip rule drops the same
 *   frames the track drops.
 * - **Idle / instant**: finalize to an integer offset and paint statically.
 */

/** Extra dot elements beyond the resting window: a step's travel plus an
 * in-flight retarget can expose one id past each edge of the window that
 * anchors the step. */
const DOT_COVERAGE_MARGIN = 2;

/** Overlay elements: a retargeted step can span up to two whole steps, whose
 * path touches at most this many integer pages with non-zero strength. */
const ACTIVE_DOT_COUNT = 4;

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



/**
 * Cache the *inputs* to the per-frame transform, not the formatted string.
 * Comparing numeric values against epsilons lets us skip both the
 * template-literal allocation in `toTransform(...)` AND the DOM style
 * write when nothing visibly changed since the last frame — a steady-
 * state widget settles into emitting zero DOM writes per rAF.
 */
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

/** One in-flight WAAPI step: target + the plan data needed to sample the
 * live offset without touching the DOM. */
interface ActiveStep {
  from: number;
  target: number;
  direction: -1 | 0 | 1;
  targetKey: number;
  duration: number;
  startedAt: number;
  stops: readonly number[];
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

  /** The widget's own step counter — where the strip logically sits. */
  const offsetRef = useRef(0);
  const stepRef = useRef<ActiveStep | null>(null);
  const followUnsubRef = useRef<(() => void) | null>(null);
  const followBaseRef = useRef<{ pageOffset: number; offset: number } | null>(
    null,
  );

  const side = widgetProjectionSide(geometry.visibleCount);
  const dotCount = widgetProjectionSlotCount(geometry.visibleCount) + DOT_COVERAGE_MARGIN;
  const activeSlotIndex = side + DOT_COVERAGE_MARGIN / 2;

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

        // Two live overlays (floor/ceil of the offset); the coverage extras
        // stay hidden outside WAAPI steps.
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
      const firstId = Math.round(visualOffset) - side - DOT_COVERAGE_MARGIN / 2;
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

  /** Live widget offset: mid-step it is sampled from the plan's progress
   * stops (the same interpolation the compositor applies), never the DOM. */
  const currentOffset = useCallback(() => {
    const step = stepRef.current;
    if (!step) return offsetRef.current;
    const fraction =
      step.duration > 0 ? (motionNow() - step.startedAt) / step.duration : 1;
    const progress = sampleProgressStops(step.stops, fraction);
    return step.from + (step.target - step.from) * progress;
  }, []);

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
      cancelStepAnimations();
      offsetRef.current = finalOffset;
      // WAAPI owned the styles; the caches no longer describe the DOM.
      invalidateWriteCaches();
      writeOffset(finalOffset);
    },
    [cancelStepAnimations, invalidateWriteCaches, writeOffset],
  );

  const startWaapiStep = useCallback(
    (plan: WaapiMotionPlan) => {
      // A far-GO_TO approach slice: the whole command was already planned by
      // the preflight publication — keep the running step.
      if (plan.isContinuation && stepRef.current) return;

      const previous = stepRef.current;
      const from = currentOffset();

      let target: number;
      if (previous && plan.targetKey === previous.targetKey) {
        // Retiming of the same logical destination (repeated-click refresh,
        // settle re-anchor): keep the widget's target, rebuild the timing.
        target = previous.target;
      } else if (
        previous &&
        plan.direction !== 0 &&
        plan.direction === previous.direction
      ) {
        // Same-direction retarget while mid-step (repeated click advanced the
        // deck's destination): one more step from the current target.
        target = previous.target + plan.direction;
      } else if (plan.direction > 0) {
        target = Math.floor(from) + 1;
      } else if (plan.direction < 0) {
        target = Math.ceil(from) - 1;
      } else {
        // Snap-back: return to the nearest integer step.
        target = Math.round(from);
      }

      cancelStepAnimations();
      invalidateWriteCaches();

      const animations: Animation[] = [];
      const lowId =
        Math.floor(Math.min(from, target)) - side - DOT_COVERAGE_MARGIN / 2;

      // Temporal curve and spatial path fold into one keyframe list per dot
      // (the i-th keyframe is the projection at the plan's progress stop i),
      // so no easing function is involved — same delivery as the track.
      for (let index = 0; index < dotCount; index += 1) {
        const dot = dotRefs.current[index];
        if (!dot) continue;
        const keyframes = sampleDotTrajectory(
          lowId + index,
          from,
          target,
          geometry,
          plan.stops,
        );
        let animation: Animation;
        try {
          animation = dot.animate(keyframes, {
            duration: plan.duration,
            fill: "both",
          });
        } catch {
          // No WAAPI keyframe support — leave the strip static; the deck
          // still moves (its own fallback), and the step finalizes below.
          continue;
        }
        try {
          animation.startTime = plan.startedAt;
        } catch {
          // Engines that reject an explicit startTime run play-pending.
        }
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
          plan.stops,
        );
        try {
          const animation = overlay.animate(keyframes, {
            duration: plan.duration,
            fill: "both",
          });
          try {
            animation.startTime = plan.startedAt;
          } catch {
            // play-pending fallback
          }
          animations.push(animation);
        } catch {
          continue;
        }
      }

      if (animations.length === 0) {
        // Nothing animatable (no refs yet / no keyframe support): land
        // directly on the target.
        offsetRef.current = target;
        writeOffset(target);
        return;
      }

      const step: ActiveStep = {
        from,
        target,
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
        finalizeStep(step.target);
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
      if (followUnsubRef.current || !visualPosition) return;
      // Take over from wherever the strip visually is right now.
      const start = currentOffset();
      cancelStepAnimations();
      invalidateWriteCaches();
      offsetRef.current = start;
      writeOffset(start);
      followBaseRef.current = null;

      followUnsubRef.current = visualPosition.subscribe(
        (frame) => {
          // Delta-follow: the widget advances by the deck's page-offset delta,
          // staying in its own decoupled step domain; the epsilon gates in
          // `writeOffset` filter imperceptible deltas.
          if (followBaseRef.current === null) {
            followBaseRef.current = {
              pageOffset: frame.pageOffset,
              offset: offsetRef.current,
            };
          }
          const base = followBaseRef.current;
          const next = base.offset + (frame.pageOffset - base.pageOffset);
          offsetRef.current = next;

          // Legacy-fallback relief: the SAME source-numbered rule the track
          // uses, so both drop exactly the same frames. Drag follows
          // (isFallback false) always paint at full rate.
          if (isFallback && isDroppedFallbackFrame(frame)) return;
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
            finalizeStep(stepRef.current.target);
          }
          return;
        }
      }
    },
    [currentOffset, finalizeStep, startFollowing, startWaapiStep, stopFollowing],
  );

  useIsomorphicLayoutEffect(() => {
    // Initial static paint, then follow the engine's plans.
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
