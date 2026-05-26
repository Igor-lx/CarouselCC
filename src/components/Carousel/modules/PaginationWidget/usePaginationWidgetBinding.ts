import { useCallback, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../shared";
import type { VisualPositionSource } from "../../position";
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
  transform: string;
  opacity: number;
}

interface ActiveDotWriteCache {
  transform: string;
  opacity: number;
}

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
        const transform = toTransform(x, scale);
        const last = cache[index];

        if (last === null || last.transform !== transform) {
          dot.style.transform = transform;
        }
        if (last === null || last.opacity !== opacity) {
          dot.style.opacity = String(opacity);
        }

        if (last === null) cache[index] = { transform, opacity };
        else {
          last.transform = transform;
          last.opacity = opacity;
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
        const transform = toTransform(state.x, state.scale);
        const last = cache[index];

        if (state.opacity === 0 && last !== null && last.opacity === 0) continue;
        if (last === null || last.transform !== transform) {
          dot.style.transform = transform;
        }
        if (last === null || last.opacity !== state.opacity) {
          dot.style.opacity = String(state.opacity);
        }
        if (last === null) cache[index] = { transform, opacity: state.opacity };
        else {
          last.transform = transform;
          last.opacity = state.opacity;
        }
      }

      writeActiveProjection(visualOffset);
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
