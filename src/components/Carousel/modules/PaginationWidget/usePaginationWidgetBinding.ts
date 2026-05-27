import { useCallback, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../shared";
import { traceCarousel } from "../../debug/performanceTrace";
import type { VisualPositionSource } from "../../position";
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
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "./types";

const ACTIVE_DOT_COUNT = 2;

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

interface DotWriteCache {
  x: number;
  scale: number;
  opacity: number;
}

interface ActiveDotWriteCache {
  x: number;
  scale: number;
  opacity: number;
}

const shouldWriteTransform = (
  last: DotWriteCache | ActiveDotWriteCache | null,
  x: number,
  scale: number,
) =>
  last === null ||
  Math.abs(last.x - x) >= DOT_POSITION_EPSILON_PX ||
  Math.abs(last.scale - scale) >= DOT_SCALE_EPSILON;

const shouldWriteOpacity = (
  last: DotWriteCache | ActiveDotWriteCache | null,
  opacity: number,
) => last === null || Math.abs(last.opacity - opacity) >= DOT_OPACITY_EPSILON;

interface UseBindingInput {
  visualPosition: VisualPositionSource | null;
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
      const floorId = Math.floor(visualOffset);
      const ceilId = Math.ceil(visualOffset);
      const cache = activeDotCacheRef.current;
      let changedProperties = 0;

      for (let index = 0; index < ACTIVE_DOT_COUNT; index += 1) {
        const dot = activeDotRefs.current[index];
        if (!dot) continue;

        const id = index === 0 ? floorId : ceilId;
        const isDuplicate = index > 0 && id === floorId;
        const state =
          typeof id === "number" && !isDuplicate
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
          changedProperties += 1;
        }
        if (opacityChanged) {
          dot.style.opacity = String(opacity);
          changedProperties += 1;
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

      return changedProperties;
    },
    [geometry],
  );

  const writeVisualOffset = useCallback(
    (visualOffset: number) => {
      const firstId = Math.round(visualOffset) - side;
      const cache = dotCacheRef.current;
      let changedProperties = 0;

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
          changedProperties += 1;
        }
        if (opacityChanged) {
          dot.style.opacity = String(state.opacity);
          changedProperties += 1;
        }
        if (last === null) {
          cache[index] = {
            x: state.x,
            scale: state.scale,
            opacity: state.opacity,
          };
        }
        else {
          if (transformChanged) {
            last.x = state.x;
            last.scale = state.scale;
          }
          if (opacityChanged) last.opacity = state.opacity;
        }
      }

      changedProperties += writeActiveProjection(visualOffset);
      if (changedProperties === 0) return;

      traceCarousel("paginationWidget:write", {
        changedProperties,
        slotCount,
        visualOffset,
      });
    },
    [geometry, side, slotCount, writeActiveProjection],
  );

  useIsomorphicLayoutEffect(() => {
    if (!visualPosition) return;
    return visualPosition.subscribe(
      (frame) => writeVisualOffset(frame.pageOffset),
      { emitCurrent: true },
    );
  }, [visualPosition, writeVisualOffset]);

  return {
    bindDotRef,
    bindActiveDotRef,
    slotCount,
    activeDotCount: ACTIVE_DOT_COUNT,
  };
}
