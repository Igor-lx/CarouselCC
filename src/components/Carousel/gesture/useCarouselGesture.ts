import { useCallback, useRef, type RefObject } from "react";

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
  isDragging: boolean;
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

  const handlePressStart = useCallback(() => {
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
  }, [applyTrackPosition, dispatch, getSlotSize, layout, readCurrentPosition]);

  const handleDragMove = useCallback(
    (payload: PointerSwipeMovePayload) => {
      applyTrackPosition(offsetToPosition(payload.uiOffset));
    },
    [applyTrackPosition, offsetToPosition],
  );

  const handleRelease = useCallback(
    (payload: PointerSwipeReleasePayload) => {
      if (!enabled) {
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

  const { isDragging, listeners } = usePointerSwipe({
    enabled,
    measureRef: viewportRef,
    config: config.swipeConfig,
    onPressStart: handlePressStart,
    onDragMove: handleDragMove,
    onRelease: handleRelease,
  });

  return { isDragging, listeners };
}
