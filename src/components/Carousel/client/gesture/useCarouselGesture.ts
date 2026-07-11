import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import {
  nearestPageIndex,
  pointerVelocityToVirtual,
  resolveDragRelease,
  type CarouselLayout,
} from "../domain";
import { resolveSlotAdaptiveSwipeConfig } from "../config";
import type { CarouselRuntimeConfig } from "../config";
import { useMeasuredSlotSize } from "../geometry";
import type { CarouselDispatch } from "../state";
import {
  usePointerSwipe,
  type PointerSwipeHostProps,
  type PointerSwipeMovePayload,
  type PointerSwipeReleasePayload,
} from "../../../../shared";

interface UseCarouselGestureInput {
  viewportRef: RefObject<HTMLDivElement | null>;
  layout: CarouselLayout;
  /**
   * Public gesture switch (`isSwipeOn` prop). When `false` the pointer-swipe
   * primitive attaches NO listeners at all — the viewport carries zero
   * pointer handlers, as if the gesture surface did not exist.
   */
  isSwipeOn: boolean;
  dispatch: CarouselDispatch;
  readCurrentPosition: () => number;
  applyTrackPosition: (position: number) => void;
  /**
   * Synchronously tear down any compositor track animation, pinning the track
   * at `position`. Called at press so the finger owns the track in the same
   * turn — without waiting for the motion runner's post-commit effect.
   */
  cancelTrackMotion: (position: number) => void;
  getSlotSize: () => number;
  config: CarouselRuntimeConfig;
}

export interface CarouselGestureResult {
  /** Spread onto the viewport element — ref + listeners + engine styles in
   * one bundle; the engine forwards the node into `viewportRef`. */
  hostProps: PointerSwipeHostProps;
}

export function useCarouselGesture({
  viewportRef,
  layout,
  isSwipeOn,
  dispatch,
  readCurrentPosition,
  applyTrackPosition,
  cancelTrackMotion,
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
    // Called from two paths: `onPressStart` on a non-interactive surface, and
    // `onDragStart` for an interactive child once horizontal intent is
    // recognised. The early return deduplicates the second path when the first
    // has already initialised this drag.
    if (originPositionRef.current !== null) return;

    slotSizeRef.current = getSlotSize();
    const origin = readCurrentPosition();
    // Take the track synchronously: drop any compositor animation and pin it at
    // the live origin *first*, so the finger owns the track in this same turn
    // (otherwise the per-frame write below is suppressed while the compositor
    // animation is still live, and ownership would only transfer after the
    // motion runner's post-commit effect).
    cancelTrackMotion(origin);
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
    cancelTrackMotion,
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
      if (!layout.canSlide || originPositionRef.current === null) {
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
    [applyTrackPosition, dispatch, layout, offsetToPosition],
  );

  // When the gesture surface goes away — the deck collapsed to a single page
  // (`canSlide` false) or the host flipped `isSwipeOn` off — the pointer-swipe
  // listeners are torn down without ever delivering `onRelease`. For a layout
  // collapse the reducer recovers from the stale `dragging` phase on its own
  // via layout reconciliation, but the adapter's drag-origin refs would
  // otherwise stay pinned — and `startDragFromCurrentPosition` early-returns
  // while `originPositionRef` is non-null, so the *next* drag would start from
  // a stale origin. Clearing the refs here keeps a later drag correct.
  //
  // An `isSwipeOn` flip has no such reducer-side recovery (the layout did not
  // change), so a drag orphaned by it is ended here explicitly: a passive
  // snap from the live position, zero release velocity — the same command a
  // real motionless release would have produced.
  useEffect(() => {
    if (layout.canSlide && isSwipeOn) return;
    if (!isSwipeOn && layout.canSlide && originPositionRef.current !== null) {
      const releasePosition = readCurrentPosition();
      const releaseTarget = resolveDragRelease({
        direction: "none",
        releasePosition,
        dragOriginPageIndex: originPageIndexRef.current,
        layout,
      });
      dispatch({
        type: "END_DRAG",
        fromVirtualIndex: releasePosition,
        targetPageIndex: releaseTarget.targetPageIndex,
        targetVirtualIndex: releaseTarget.targetVirtualIndex,
        isSnap: releaseTarget.isSnap,
        pointerReleaseVelocity: 0,
        uiReleaseVelocity: 0,
      });
    }
    originPositionRef.current = null;
    slotSizeRef.current = 0;
  }, [dispatch, isSwipeOn, layout, readCurrentPosition]);

  // Content-normalized engine tuning: the commit threshold is a share of
  // the MEASURED slot (clamped to ergonomic px bounds) and the rubber
  // curvature is rescaled to the slot, so the swipe feels identical at any
  // visibleSlidesNr / device size. Pre-measure frames fall back to the base
  // config (see resolveSlotAdaptiveSwipeConfig).
  const slotPx = useMeasuredSlotSize({
    viewportRef,
    visibleSlidesCount: layout.visibleSlidesCount,
  });
  const swipeConfig = useMemo(
    () => resolveSlotAdaptiveSwipeConfig(config.swipeConfig, slotPx),
    [config.swipeConfig, slotPx],
  );

  const { hostProps } = usePointerSwipe({
    enabled: layout.canSlide && isSwipeOn,
    hostRef: viewportRef,
    config: swipeConfig,
    onPressStart: startDragFromCurrentPosition,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onRelease: handleRelease,
  });

  return { hostProps };
}
