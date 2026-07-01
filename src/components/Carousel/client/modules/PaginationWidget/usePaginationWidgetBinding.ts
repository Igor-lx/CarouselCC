import { useCallback, useMemo, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../../shared";
import type { MotionPlan, MotionPlanSource, VisualPositionSource } from "../../position";
import {
  DOT_OPACITY_EPSILON,
  DOT_POSITION_EPSILON_PX,
  DOT_SCALE_EPSILON,
} from "./defaults";
import {
  buildProjectionKeyframes,
  fixedIdAt,
  type DotKeyframeSample,
} from "./math/keyframes";
import { writeDotProjection } from "./math/projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

/**
 * Per composited segment, ~3 keyframes per page screen of travel is dense
 * enough that the nonlinear projection is sub-pixel between keyframes while the
 * WAAPI keyframe list stays small.
 */
const KEYFRAME_STEPS_PER_PAGE = 3;
const MIN_KEYFRAME_STEPS = 8;
const MAX_KEYFRAME_STEPS = 120;

const ACTIVE_STRENGTH_VAR = "--dot-active-strength";

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
 * Cache the *inputs* to the per-frame write, not the formatted string. Compare
 * numeric values against epsilons to skip both the template-literal allocation
 * and the DOM write when nothing visibly changed — a steady-state widget emits
 * zero per-rAF DOM writes.
 */
interface DotWriteCache {
  x: number;
  scale: number;
  opacity: number;
  activeStrength: number;
}

const shouldWriteTransform = (
  last: DotWriteCache | null,
  x: number,
  scale: number,
): boolean =>
  last === null ||
  Math.abs(last.x - x) >= DOT_POSITION_EPSILON_PX ||
  Math.abs(last.scale - scale) >= DOT_SCALE_EPSILON;

const shouldWriteOpacity = (last: number | null, value: number): boolean =>
  last === null || Math.abs(last - value) >= DOT_OPACITY_EPSILON;

const resolveKeyframeSteps = (fromOffset: number, toOffset: number): number => {
  const pages = Math.abs(toOffset - fromOffset);
  return Math.min(
    MAX_KEYFRAME_STEPS,
    Math.max(MIN_KEYFRAME_STEPS, Math.ceil(pages * KEYFRAME_STEPS_PER_PAGE)),
  );
};

/**
 * The page-dot ids the widget mounts for a given center page: a symmetric
 * window `[center - side, center + side]`. One DOM node per *page identity*
 * (not per recycling slot), so each node's projected trajectory — slide, scale,
 * fade, glow — is continuous as the deck offset sweeps, which is exactly what a
 * WAAPI keyframe interpolation needs.
 */
export const widgetDotWindow = (
  centerPage: number,
  side: number,
): number[] => {
  const ids: number[] = [];
  for (let id = centerPage - side; id <= centerPage + side; id += 1) ids.push(id);
  return ids;
};

interface UseBindingInput {
  visualPosition: VisualPositionSource | null;
  /**
   * Compositor motion-plan mirror. When it carries a plan the widget animates
   * each dot through the Web Animations API (one composited animation per dot)
   * instead of writing `style` every frame — collapsing the per-step main-thread
   * style-recalc churn to zero. `null` (drag, profile segment, idle settle,
   * reduced motion) keeps the per-frame `visualPosition` follow path.
   */
  motionPlan: MotionPlanSource | null;
  geometry: PaginationWidgetGeometry;
  /** The page-dot ids currently mounted (see `widgetDotWindow`). */
  dotIds: number[];
}

export interface PaginationWidgetBinding {
  bindDotRef: (id: number) => (node: HTMLDivElement | null) => void;
}

export function usePaginationWidgetBinding({
  visualPosition,
  motionPlan,
  geometry,
  dotIds,
}: UseBindingInput): PaginationWidgetBinding {
  // DOM nodes keyed by page-dot id (stable identity across the strip).
  const nodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const refCallbacksRef = useRef<Map<number, (node: HTMLDivElement | null) => void>>(new Map());
  const writeCacheRef = useRef<Map<number, DotWriteCache>>(new Map());
  const projectionRef = useRef<PaginationWidgetDotState>(emptyDotState());

  // Live compositor animations keyed by id, and the plan version they belong to.
  // While non-null, the per-frame follow path stands aside — the same pattern
  // the track binding uses while its WAAPI animation owns the track.
  const animationsRef = useRef<Map<number, Animation>>(new Map());
  const compositedVersionRef = useRef<number | null>(null);

  const bindDotRef = useCallback((id: number) => {
    const cached = refCallbacksRef.current.get(id);
    if (cached) return cached;
    const callback = (node: HTMLDivElement | null) => {
      if (node) nodesRef.current.set(id, node);
      else nodesRef.current.delete(id);
    };
    refCallbacksRef.current.set(id, callback);
    return callback;
  }, []);

  const writeDot = useCallback(
    (id: number, node: HTMLDivElement, offset: number) => {
      const state = writeDotProjection(projectionRef.current, id, offset, geometry);
      const cache = writeCacheRef.current.get(id) ?? null;

      // A fully-transparent dot that is already transparent needs no write.
      if (state.opacity === 0 && cache !== null && cache.opacity === 0 && state.activeStrength === 0 && cache.activeStrength === 0) {
        return;
      }

      const transformChanged = shouldWriteTransform(cache, state.x, state.scale);
      const opacityChanged = shouldWriteOpacity(cache?.opacity ?? null, state.opacity);
      const activeChanged = shouldWriteOpacity(cache?.activeStrength ?? null, state.activeStrength);

      if (transformChanged) node.style.transform = toTransform(state.x, state.scale);
      if (opacityChanged) node.style.opacity = String(state.opacity);
      if (activeChanged) node.style.setProperty(ACTIVE_STRENGTH_VAR, String(state.activeStrength));

      writeCacheRef.current.set(id, {
        x: state.x,
        scale: state.scale,
        opacity: state.opacity,
        activeStrength: state.activeStrength,
      });
    },
    [geometry],
  );

  const writeAll = useCallback(
    (offset: number) => {
      nodesRef.current.forEach((node, id) => writeDot(id, node, offset));
    },
    [writeDot],
  );

  // --- compositor fast-path -------------------------------------------------

  const cancelCompositorDots = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current.clear();
    compositedVersionRef.current = null;
  }, []);

  const runCompositorPlan = useCallback(
    (plan: MotionPlan) => {
      const steps = resolveKeyframeSteps(plan.fromPageOffset, plan.toPageOffset);
      cancelCompositorDots();

      let started = false;
      nodesRef.current.forEach((node, id) => {
        if (typeof node.animate !== "function") return;
        const samples: DotKeyframeSample[] = buildProjectionKeyframes(
          fixedIdAt(id),
          plan.fromPageOffset,
          plan.toPageOffset,
          plan.easing,
          geometry,
          steps,
        );
        const keyframes = samples.map((s) => ({
          offset: s.offset,
          transform: toTransform(s.x, s.scale),
          opacity: String(s.opacity),
          [ACTIVE_STRENGTH_VAR]: String(s.activeStrength),
        }));
        try {
          // `easing: linear` — the bezier is baked into the keyframe values;
          // `fill: both` so the dot holds the settled state after finish.
          const animation = node.animate(keyframes, {
            duration: plan.duration,
            easing: "linear",
            fill: "both",
          });
          animationsRef.current.set(id, animation);
          started = true;
        } catch {
          // Restrictive engine: leave this dot on the per-frame path.
        }
      });

      if (!started) {
        cancelCompositorDots();
        return;
      }
      compositedVersionRef.current = plan.version;
      // The composited keyframes now own each dot's transform/opacity; the next
      // per-frame write (after the plan clears) must be unconditional.
      writeCacheRef.current.clear();
    },
    [cancelCompositorDots, geometry],
  );

  // Per-frame follow path (SSOT). Always subscribed; stands aside while a
  // compositor plan owns the dots.
  useIsomorphicLayoutEffect(() => {
    if (!visualPosition) return;
    return visualPosition.subscribe(
      (frame) => {
        if (compositedVersionRef.current !== null) return;
        writeAll(frame.pageOffset);
      },
      { emitCurrent: true },
    );
  }, [visualPosition, writeAll]);

  // Compositor fast path. A plan animates every dot; a `null` tears the
  // animations down and re-pins the dots to the live SSOT position so the
  // follow path resumes with no visual gap.
  useIsomorphicLayoutEffect(() => {
    if (!motionPlan) return;
    const apply = (plan: MotionPlan | null) => {
      if (plan) {
        runCompositorPlan(plan);
      } else {
        cancelCompositorDots();
        writeCacheRef.current.clear();
        if (visualPosition) writeAll(visualPosition.getSnapshot().pageOffset);
      }
    };
    apply(motionPlan.getPlan());
    return motionPlan.subscribe(apply);
  }, [motionPlan, runCompositorPlan, cancelCompositorDots, visualPosition, writeAll]);

  // When the mounted id window changes (a step settled and the strip re-centred),
  // a freshly-mounted dot has no style yet — pin every dot to the current SSOT
  // position so new dots appear correctly and stale caches are dropped.
  const dotIdsKey = useMemo(() => dotIds.join(","), [dotIds]);
  useIsomorphicLayoutEffect(() => {
    if (compositedVersionRef.current !== null) return;
    writeCacheRef.current.clear();
    if (visualPosition) writeAll(visualPosition.getSnapshot().pageOffset);
  }, [dotIdsKey, visualPosition, writeAll]);

  // Tear down compositor animations on unmount / geometry change.
  useIsomorphicLayoutEffect(() => cancelCompositorDots, [cancelCompositorDots]);

  return { bindDotRef };
}
