import { useCallback, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../../shared";
import { parseBezier } from "../../motion/bezier";
import { WIDGET_STEP_DURATION_MS, WIDGET_STEP_EASING } from "./defaults";
import { buildProjectionKeyframes, fixedIdAt } from "./math/keyframes";
import { writeDotProjection } from "./math/projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

/** ~10 keyframes for a single-step sweep — dense enough to be sub-pixel smooth. */
const KEYFRAME_STEPS = 10;

const ACTIVE_STRENGTH_VAR = "--dot-active-strength";

const WIDGET_EASING = parseBezier(WIDGET_STEP_EASING);

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
 * The page-dot ids the widget mounts for a given centre offset: a symmetric
 * window `[round(offset) - side, round(offset) + side]`. One DOM node per *page
 * identity* (not per recycling slot), so each node's projected trajectory —
 * slide, scale, fade, glow — is continuous, which is what WAAPI keyframe
 * interpolation needs.
 */
export const widgetDotWindow = (centerId: number, side: number): number[] => {
  const ids: number[] = [];
  for (let id = centerId - side; id <= centerId + side; id += 1) ids.push(id);
  return ids;
};

interface UseBindingInput {
  /**
   * The widget's own destination offset — its private, monotonic coordinate
   * (advanced by exactly one dot per navigation by the component). The binding
   * animates the strip from its last offset to this one, on the widget's own
   * timing. Fully decoupled from the deck's motion.
   */
  targetOffset: number;
  /** Reduced motion: snap without animating. */
  isInstant: boolean;
  geometry: PaginationWidgetGeometry;
  /** The page-dot ids currently mounted (from the widget's own offset). */
  dotIds: number[];
}

export interface PaginationWidgetBinding {
  bindDotRef: (id: number) => (node: HTMLDivElement | null) => void;
}

export function usePaginationWidgetBinding({
  targetOffset,
  isInstant,
  geometry,
  dotIds,
}: UseBindingInput): PaginationWidgetBinding {
  // DOM nodes keyed by page-dot id (stable identity across the strip).
  const nodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const refCallbacksRef = useRef<Map<number, (node: HTMLDivElement | null) => void>>(new Map());
  const projectionRef = useRef<PaginationWidgetDotState>(emptyDotState());

  // The widget's own animation state, decoupled from the deck:
  //  - `settledOffsetRef`: where the strip currently rests / is heading. `null`
  //    until the first paint seeds it.
  const settledOffsetRef = useRef<number | null>(null);
  const animationsRef = useRef<Map<number, Animation>>(new Map());

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

  const paintDot = useCallback(
    (id: number, node: HTMLDivElement, offset: number) => {
      const s = writeDotProjection(projectionRef.current, id, offset, geometry);
      node.style.transform = toTransform(s.x, s.scale);
      node.style.opacity = String(s.opacity);
      node.style.setProperty(ACTIVE_STRENGTH_VAR, String(s.activeStrength));
    },
    [geometry],
  );

  const paintAll = useCallback(
    (offset: number) => {
      nodesRef.current.forEach((node, id) => paintDot(id, node, offset));
    },
    [paintDot],
  );

  const cancelAnimations = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current.clear();
  }, []);

  // Animate every dot from `fromOffset` to `toOffset` on the widget's own timing.
  const animateTo = useCallback(
    (fromOffset: number, toOffset: number) => {
      cancelAnimations();
      // The window is centred on the destination, so the whole travel from
      // `fromOffset` is covered; the entering dot starts faint and grows in.
      const steps = Math.max(
        KEYFRAME_STEPS,
        Math.ceil(Math.abs(toOffset - fromOffset) * KEYFRAME_STEPS),
      );
      let started = false;
      nodesRef.current.forEach((node, id) => {
        if (typeof node.animate !== "function") {
          paintDot(id, node, toOffset);
          return;
        }
        const samples = buildProjectionKeyframes(
          fixedIdAt(id),
          fromOffset,
          toOffset,
          WIDGET_EASING,
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
          const animation = node.animate(keyframes, {
            duration: WIDGET_STEP_DURATION_MS,
            easing: "linear", // bezier baked into the keyframe values
            fill: "both",
          });
          animationsRef.current.set(id, animation);
          started = true;
        } catch {
          paintDot(id, node, toOffset);
        }
      });
      if (!started) paintAll(toOffset);
    },
    [cancelAnimations, geometry, paintAll, paintDot],
  );

  // Seed the first paint once dots have mounted.
  useIsomorphicLayoutEffect(() => {
    if (settledOffsetRef.current === null) {
      settledOffsetRef.current = targetOffset;
      paintAll(targetOffset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the destination offset changing: animate (or snap) the WHOLE strip
  // there from the previous offset. `animateTo` animates every currently-mounted
  // dot — including the one that entered the window in this same commit — from
  // `from`, so a freshly-mounted dot slides in from its origin instead of
  // popping to the destination first. A change arriving mid-animation re-bakes
  // from the last settled offset, so rapid navigations chain smoothly.
  //
  // `dotIds` is a dependency so that if the window remounts (new dot node) the
  // effect re-runs and the new node is animated/pinned in the same pass — but
  // it early-returns when nothing actually moved, so an unrelated re-render is a
  // no-op.
  const dotIdsKey = dotIds.join(",");
  const lastPaintedOffsetRef = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const from = settledOffsetRef.current;
    if (from === null) return;

    if (from === targetOffset) {
      // No navigation — but the window may have remounted (settle re-centre).
      // Pin any dot that has no live animation to the settled offset.
      if (lastPaintedOffsetRef.current !== targetOffset || animationsRef.current.size === 0) {
        nodesRef.current.forEach((node, id) => {
          if (animationsRef.current.has(id)) return;
          paintDot(id, node, targetOffset);
        });
        lastPaintedOffsetRef.current = targetOffset;
      }
      return;
    }

    settledOffsetRef.current = targetOffset;
    lastPaintedOffsetRef.current = targetOffset;
    if (isInstant) {
      cancelAnimations();
      paintAll(targetOffset);
      return;
    }
    animateTo(from, targetOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOffset, dotIdsKey, isInstant, animateTo, cancelAnimations, paintAll, paintDot]);

  useIsomorphicLayoutEffect(() => cancelAnimations, [cancelAnimations]);

  return { bindDotRef };
}
