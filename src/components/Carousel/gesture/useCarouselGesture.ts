import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  nearestPageIndex,
  pointerVelocityToVirtual,
  resolveDragRelease,
  type CarouselLayout,
} from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import type { CarouselDispatch } from "../state";
import {
  usePointerSwipe,
  type PointerSwipeListeners,
  type PointerSwipeMovePayload,
  type PointerSwipeReleasePayload,
} from "../../../shared";

interface UseCarouselGestureInput {
  enabled: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  layout: CarouselLayout;
  dispatch: CarouselDispatch;
  readCurrentPosition: () => number;
  applyTrackPosition: (position: number) => void;
  getSlotSize: () => number;
  config: CarouselRuntimeConfig;
}

export interface CarouselGestureResult {
  listeners: PointerSwipeListeners;
}

export function useCarouselGesture({
  enabled,
  viewportRef,
  layout,
  dispatch,
  readCurrentPosition,
  applyTrackPosition,
  getSlotSize,
  config,
}: UseCarouselGestureInput): CarouselGestureResult {
  const originPositionRef = useRef<number | null>(null);
  const originPageIndexRef = useRef(0);
  const slotSizeRef = useRef(0);

  const offsetToPosition = useCallback(
    (uiOffset: number) => {
      const origin = originPositionRef.current ?? 0;
      const slot = slotSizeRef.current;
      return slot > 0 ? origin - uiOffset / slot : origin;
    },
    [],
  );

  const startDragFromCurrentPosition = useCallback(() => {
    // Called from two paths: `onPressStart` on a non-interactive surface
    // (immediate motion cancel), and `onDragStart` for an interactive child
    // once horizontal intent is recognised. The early return deduplicates the
    // second path when the first has already initialised this drag.
    if (originPositionRef.current !== null) return;

    slotSizeRef.current = getSlotSize();
    const origin = readCurrentPosition();
    applyTrackPosition(origin);
    const pageIndex = nearestPageIndex(origin, layout);

    originPositionRef.current = origin;
    originPageIndexRef.current = pageIndex;

    dispatch({
      type: "START_DRAG",
      fromVirtualIndex: origin,
      targetPageIndex: pageIndex,
    });
  }, [
    applyTrackPosition,
    dispatch,
    getSlotSize,
    layout,
    readCurrentPosition,
  ]);

  const handleDragStart = useCallback(
    (payload: PointerSwipeMovePayload) => {
      startDragFromCurrentPosition();
      applyTrackPosition(offsetToPosition(payload.uiOffset));
    },
    [
      applyTrackPosition,
      offsetToPosition,
      startDragFromCurrentPosition,
    ],
  );

  const handleDragMove = useCallback(
    (payload: PointerSwipeMovePayload) => {
      if (originPositionRef.current === null) return;
      applyTrackPosition(offsetToPosition(payload.uiOffset));
    },
    [applyTrackPosition, offsetToPosition],
  );

  const handleRelease = useCallback(
    (payload: PointerSwipeReleasePayload) => {
      if (!enabled || originPositionRef.current === null) {
        originPositionRef.current = null;
        slotSizeRef.current = 0;
        return;
      }

      const releasePosition = offsetToPosition(payload.uiOffset);
      const releaseTarget = resolveDragRelease({
        direction: payload.direction,
        releasePosition,
        dragOriginPageIndex: originPageIndexRef.current,
        layout,
      });

      applyTrackPosition(releasePosition);

      dispatch({
        type: "END_DRAG",
        fromVirtualIndex: releasePosition,
        targetPageIndex: releaseTarget.targetPageIndex,
        targetVirtualIndex: releaseTarget.targetVirtualIndex,
        isSnap: releaseTarget.isSnap,
        pointerReleaseVelocity: pointerVelocityToVirtual(
          payload.pointerReleaseVelocity,
          slotSizeRef.current,
        ),
        uiReleaseVelocity: pointerVelocityToVirtual(
          payload.uiReleaseVelocity,
          slotSizeRef.current,
        ),
      });

      originPositionRef.current = null;
      slotSizeRef.current = 0;
    },
    [applyTrackPosition, dispatch, enabled, layout, offsetToPosition],
  );

  // When the carousel becomes non-sliding (`enabled` flips false because a
  // resize or slidesData replace collapsed the deck to a single page), the
  // pointer-swipe listeners are torn down without ever delivering `onRelease`.
  // The reducer recovers from the stale `dragging` phase on its own via layout
  // reconciliation, but the adapter's drag-origin refs would otherwise stay
  // pinned — and `startDragFromCurrentPosition` early-returns while
  // `originPositionRef` is non-null, so the *next* drag would start from a
  // stale origin. Clearing the refs here keeps a later drag correct.
  useEffect(() => {
    if (enabled) return;
    originPositionRef.current = null;
    slotSizeRef.current = 0;
  }, [enabled]);

  const { listeners } = usePointerSwipe({
    enabled,
    measureRef: viewportRef,
    config: config.swipeConfig,
    onPressStart: startDragFromCurrentPosition,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onRelease: handleRelease,
  });

  return { listeners };
}
