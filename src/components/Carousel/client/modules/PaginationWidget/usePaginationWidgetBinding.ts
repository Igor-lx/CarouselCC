import { useCallback, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../../shared";
import type { MotionPlan, MotionPlanSource, VisualPositionSource } from "../../position";
import {
  DOT_OPACITY_EPSILON,
  DOT_POSITION_EPSILON_PX,
  DOT_SCALE_EPSILON,
} from "./defaults";
import {
  widgetProjectionSide,
  widgetProjectionSlotCount,
} from "./math/spatialField";
import {
  activeIdAt,
  buildProjectionKeyframes,
  slotIdAt,
  type DotIdAt,
  type DotKeyframeSample,
} from "./math/keyframes";
import { writeDotProjection } from "./math/projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

const ACTIVE_DOT_COUNT = 2;

/**
 * Keyframes sampled per composited segment. ~3 per page screen of travel is
 * dense enough that the nonlinear projection and the slot-recycle sawtooth are
 * sub-pixel between keyframes, while keeping the WAAPI keyframe list small.
 */
const KEYFRAME_STEPS_PER_PAGE = 3;
const MIN_KEYFRAME_STEPS = 8;
const MAX_KEYFRAME_STEPS = 120;

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

type ActiveDotWriteCache = DotWriteCache;

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

const resolveKeyframeSteps = (fromOffset: number, toOffset: number): number => {
  const pages = Math.abs(toOffset - fromOffset);
  return Math.min(
    MAX_KEYFRAME_STEPS,
    Math.max(MIN_KEYFRAME_STEPS, Math.ceil(pages * KEYFRAME_STEPS_PER_PAGE)),
  );
};

interface UseBindingInput {
  visualPosition: VisualPositionSource | null;
  /**
   * Compositor motion-plan mirror. When it carries a plan, the widget animates
   * its dots through the Web Animations API (one composited animation per dot)
   * instead of writing `style` every frame — collapsing the per-step main-thread
   * style-recalc churn to zero. `null` (drag, profile segment, idle settle, or
   * reduced motion) keeps the per-frame `visualPosition` follow path.
   */
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
  const activeDotCacheRef = useRef<Array<ActiveDotWriteCache | null>>([]);
  const projectionRef = useRef<PaginationWidgetDotState>(emptyDotState());
  const activeProjectionRef = useRef<PaginationWidgetDotState>(emptyDotState());
  const appliedActiveClassNameRef = useRef<string | null>(null);

  // Live compositor animations (one per node), and the plan version they belong
  // to. While non-null, the per-frame follow path stands aside — exactly the
  // pattern the track binding uses while its WAAPI animation owns the track.
  const dotAnimationsRef = useRef<Array<Animation | null>>([]);
  const activeAnimationsRef = useRef<Array<Animation | null>>([]);
  const compositedVersionRef = useRef<number | null>(null);

  const side = widgetProjectionSide(geometry.visibleCount);
  const slotCount = widgetProjectionSlotCount(geometry.visibleCount);
  const activeSlotIndex = side;

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
    dotCacheRef.current = new Array<DotWriteCache | null>(slotCount).fill(null);
    activeDotCacheRef.current = new Array<ActiveDotWriteCache | null>(
      ACTIVE_DOT_COUNT,
    ).fill(null);
    dotRefs.current.length = slotCount;
    dotCallbacksRef.current.length = slotCount;
    activeDotRefs.current.length = ACTIVE_DOT_COUNT;
    activeDotCallbacksRef.current.length = ACTIVE_DOT_COUNT;
    dotAnimationsRef.current.length = slotCount;
    activeAnimationsRef.current.length = ACTIVE_DOT_COUNT;
  }, [slotCount]);

  useIsomorphicLayoutEffect(() => {
    const previousActiveClassName = appliedActiveClassNameRef.current;

    for (let index = 0; index < slotCount; index += 1) {
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
  }, [activeClassName, activeSlotIndex, slotCount]);

  const writeActiveProjection = useCallback(
    (visualOffset: number) => {
      // Two scalar locals instead of a per-frame `[floor, ceil]` array
      // allocation — the active-projection write runs on every motion
      // frame so this drops one short-lived array per RAF tick.
      const floorId = Math.floor(visualOffset);
      const ceilId = Math.ceil(visualOffset);
      const cache = activeDotCacheRef.current;

      for (let index = 0; index < ACTIVE_DOT_COUNT; index += 1) {
        const dot = activeDotRefs.current[index];
        if (!dot) continue;

        const id = index === 0 ? floorId : ceilId;
        const isDuplicate = index > 0 && id === floorId;
        const state = !isDuplicate
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

  const writeVisualOffset = useCallback(
    (visualOffset: number) => {
      const firstId = Math.round(visualOffset) - side;
      const cache = dotCacheRef.current;

      for (let index = 0; index < slotCount; index += 1) {
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
    [geometry, side, slotCount, writeActiveProjection],
  );

  // --- compositor fast-path -------------------------------------------------

  const cancelCompositorDots = useCallback(() => {
    for (let i = 0; i < dotAnimationsRef.current.length; i += 1) {
      dotAnimationsRef.current[i]?.cancel();
      dotAnimationsRef.current[i] = null;
    }
    for (let i = 0; i < activeAnimationsRef.current.length; i += 1) {
      activeAnimationsRef.current[i]?.cancel();
      activeAnimationsRef.current[i] = null;
    }
    compositedVersionRef.current = null;
  }, []);

  // Reset a per-frame cache entry so the next per-frame write is unconditional
  // (the WAAPI run left the DOM at a value the cache no longer reflects).
  const invalidateCaches = useCallback(() => {
    dotCacheRef.current.fill(null);
    activeDotCacheRef.current.fill(null);
  }, []);

  const animateNode = useCallback(
    (
      node: HTMLDivElement,
      idAt: DotIdAt,
      plan: MotionPlan,
      steps: number,
      opacityFrom: (sample: DotKeyframeSample) => number,
    ): Animation | null => {
      if (typeof node.animate !== "function") return null;
      const samples = buildProjectionKeyframes(
        idAt,
        plan.fromPageOffset,
        plan.toPageOffset,
        plan.easing,
        geometry,
        steps,
      );
      const keyframes = samples.map((s) => ({
        offset: s.offset,
        transform: toTransform(s.x, s.scale),
        opacity: String(opacityFrom(s)),
      }));
      try {
        // `easing: linear` because the bezier is already baked into the keyframe
        // values; `fill: both` so the dot holds the settled state after finish.
        return node.animate(keyframes, {
          duration: plan.duration,
          easing: "linear",
          fill: "both",
        });
      } catch {
        return null;
      }
    },
    [geometry],
  );

  const runCompositorPlan = useCallback(
    (plan: MotionPlan) => {
      const steps = resolveKeyframeSteps(plan.fromPageOffset, plan.toPageOffset);

      // Replace any in-flight dot animations with the new plan's.
      cancelCompositorDots();

      let started = false;
      for (let index = 0; index < slotCount; index += 1) {
        const node = dotRefs.current[index];
        if (!node) continue;
        const anim = animateNode(node, slotIdAt(index, side), plan, steps, (s) => s.opacity);
        dotAnimationsRef.current[index] = anim;
        if (anim) started = true;
      }
      for (let index = 0; index < ACTIVE_DOT_COUNT; index += 1) {
        const node = activeDotRefs.current[index];
        if (!node) continue;
        const anim = animateNode(
          node,
          activeIdAt(index === 0 ? 0 : 1),
          plan,
          steps,
          (s) => s.activeStrength,
        );
        activeAnimationsRef.current[index] = anim;
        if (anim) started = true;
      }

      if (!started) {
        // No animatable node (no `Element.animate`): stay on the per-frame path.
        cancelCompositorDots();
        return;
      }

      compositedVersionRef.current = plan.version;
      // The composited keyframes now own the DOM transform/opacity; the next
      // per-frame write (after the plan clears) must be unconditional.
      invalidateCaches();
    },
    [animateNode, cancelCompositorDots, invalidateCaches, side, slotCount],
  );

  // Subscribe to the per-frame visual position — the SSOT follow path. It is
  // always subscribed; while a compositor plan owns the dots it stands aside,
  // exactly like the track binding suppresses its own per-frame writes.
  useIsomorphicLayoutEffect(() => {
    if (!visualPosition) return;
    return visualPosition.subscribe(
      (frame) => {
        if (compositedVersionRef.current !== null) return;
        writeVisualOffset(frame.pageOffset);
      },
      { emitCurrent: true },
    );
  }, [visualPosition, writeVisualOffset]);

  // Subscribe to the motion plan — the compositor fast path. A plan animates the
  // dots on the compositor; a `null` (drag, profile, settle) tears the
  // compositor animations down and re-pins the dots to the live per-frame
  // position so the follow path resumes seamlessly.
  useIsomorphicLayoutEffect(() => {
    if (!motionPlan) return;
    const apply = (plan: MotionPlan | null) => {
      if (plan) {
        runCompositorPlan(plan);
      } else {
        cancelCompositorDots();
        invalidateCaches();
        // Re-pin to the current SSOT position so there is no visual gap between
        // the (filled) WAAPI end state and the resumed per-frame writes.
        if (visualPosition) writeVisualOffset(visualPosition.getSnapshot().pageOffset);
      }
    };
    apply(motionPlan.getPlan());
    return motionPlan.subscribe(apply);
  }, [motionPlan, runCompositorPlan, cancelCompositorDots, invalidateCaches, visualPosition, writeVisualOffset]);

  // Tear down compositor animations on unmount / geometry change.
  useIsomorphicLayoutEffect(() => cancelCompositorDots, [cancelCompositorDots]);

  return {
    bindDotRef,
    bindActiveDotRef,
    slotCount,
    activeDotCount: ACTIVE_DOT_COUNT,
  };
}
