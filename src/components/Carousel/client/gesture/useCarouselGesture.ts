// See docs/architecture/gesture.md
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import {
  nearestPageIndex,
  pageContaining,
  pointerVelocityToVirtual,
  resolveDragRelease,
  type CarouselLayout,
} from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { resolveSlotAdaptiveSwipeConfig } from "./slotAdaptiveSwipe";
import type { CarouselDispatch } from "../state";
import {
  motionNow,
  usePointerSwipe,
  type PointerSwipeHostProps,
  type PointerSwipeMovePayload,
  type PointerSwipeReleasePayload,
} from "../../../../shared";

interface UseCarouselGestureInput {
  viewportRef: RefObject<HTMLDivElement | null>;
  /** The TRACK — the draggable surface (positive so viewport chrome never grabs a ride). */
  trackRef: RefObject<HTMLDivElement | null>;
  layout: CarouselLayout;
  /** Public gesture switch; `false` attaches NO listeners at all. */
  isSwipeOn: boolean;
  /** Pending destination of an in-flight ride, `null` while idle (the grab anchor). */
  inFlightTargetPageIndex: number | null;
  dispatch: CarouselDispatch;
  readCurrentPosition: () => number;
  applyTrackPosition: (position: number) => void;
  /** Synchronously pin the track at `position` so the finger owns it this turn. */
  cancelTrackMotion: (position: number) => void;
  getSlotSize: () => number;
  /** Published slot px from the carousel's one measurement source; `null` before
   * the first measure. Content-normalises the engine tuning (see doc). */
  slotPx: number | null;
  config: CarouselRuntimeConfig;
}

export interface CarouselGestureResult {
  /** Spread onto the viewport — ref + listeners + engine styles in one bundle. */
  hostProps: PointerSwipeHostProps;
}

export function useCarouselGesture({
  viewportRef,
  trackRef,
  layout,
  isSwipeOn,
  inFlightTargetPageIndex,
  dispatch,
  readCurrentPosition,
  applyTrackPosition,
  cancelTrackMotion,
  getSlotSize,
  slotPx,
  config,
}: UseCarouselGestureInput): CarouselGestureResult {
  const originPositionRef = useRef<number | null>(null);
  const originPageIndexRef = useRef(0);
  const isInFlightGrabRef = useRef(false);
  const pressedPageIndexRef = useRef<number | null>(null);
  const contextMenuSeenRef = useRef(false); // menu-hold vs scroll (see doc)
  const slotSizeRef = useRef(0);

  // Press-commit deferral: the grab is synchronous, the START_DRAG dispatch
  // moves to its own task; dependents flush it first to keep order (see doc).
  const pendingStartRef = useRef<{
    fromVirtualIndex: number;
    targetPageIndex: number;
  } | null>(null);
  const startTimerRef = useRef<number | null>(null);

  const flushPendingStart = useCallback(() => {
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    const pending = pendingStartRef.current;
    if (!pending) return;
    pendingStartRef.current = null;
    dispatch({ type: "START_DRAG", ...pending });
  }, [dispatch]);

  const offsetToPosition = useCallback(
    (uiOffset: number) => {
      const origin = originPositionRef.current ?? 0;
      const slot = slotSizeRef.current;
      return slot > 0 ? origin - uiOffset / slot : origin;
    },
    [],
  );

  const startDragFromCurrentPosition = useCallback((pressClientX?: number) => {
    if (originPositionRef.current !== null) return; // dedupe the two entry paths

    slotSizeRef.current = getSlotSize();
    const origin = readCurrentPosition();
    // Take the track synchronously so the finger owns it this turn.
    cancelTrackMotion(origin);
    applyTrackPosition(origin);
    const pageIndex = inFlightTargetPageIndex ?? nearestPageIndex(origin, layout);

    // Which page the finger landed on (press-X → lane → page); null if unmeasurable.
    let pressedPageIndex: number | null = null;
    const viewport = viewportRef.current;
    const slot = slotSizeRef.current;
    if (typeof pressClientX === "number" && viewport && slot > 0) {
      const rect = viewport.getBoundingClientRect();
      const lane = (pressClientX - rect.left) / slot;
      if (Number.isFinite(lane)) {
        pressedPageIndex = pageContaining(Math.floor(origin + lane), layout);
      }
    }

    originPositionRef.current = origin;
    originPageIndexRef.current = pageIndex;
    isInFlightGrabRef.current = inFlightTargetPageIndex !== null;
    pressedPageIndexRef.current = pressedPageIndex;
    contextMenuSeenRef.current = false;

    pendingStartRef.current = {
      fromVirtualIndex: origin,
      targetPageIndex: pageIndex,
    };
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      flushPendingStart();
    }, 0);
  }, [
    flushPendingStart,
    applyTrackPosition,
    cancelTrackMotion,
    getSlotSize,
    inFlightTargetPageIndex,
    layout,
    readCurrentPosition,
    viewportRef,
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
      // Reducer-order guarantee: START_DRAG always lands before END_DRAG.
      flushPendingStart();
      if (!layout.canSlide || originPositionRef.current === null) {
        originPositionRef.current = null;
        slotSizeRef.current = 0;
        return;
      }

      const releasePosition = offsetToPosition(payload.uiOffset);
      // Directionless in-flight-grab END: a deliberate hold lands on the pressed
      // slide, a page scroll resumes the interrupted ride (see doc).
      const isScrollHandOff =
        payload.direction === "none" &&
        isInFlightGrabRef.current &&
        payload.endReason !== "release" &&
        !contextMenuSeenRef.current;
      const releaseTarget = resolveDragRelease({
        direction: payload.direction,
        releasePosition,
        dragOriginPageIndex: originPageIndexRef.current,
        isInFlightGrab: isInFlightGrabRef.current,
        pressedPageIndex: isScrollHandOff ? null : pressedPageIndexRef.current,
        layout,
      });

      applyTrackPosition(releasePosition);

      const uiVirtualVelocity = pointerVelocityToVirtual(
        payload.uiReleaseVelocity,
        slotSizeRef.current,
      );

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
        uiReleaseVelocity: uiVirtualVelocity,
        launchVelocity: pointerVelocityToVirtual(
          payload.launchVelocity,
          slotSizeRef.current,
        ),
        releasedAt: motionNow(), // clock for the runner's coast (see coast.ts)
      });

      originPositionRef.current = null;
      slotSizeRef.current = 0;
    },
    [
      applyTrackPosition,
      dispatch,
      flushPendingStart,
      layout,
      offsetToPosition,
    ],
  );

  // Gesture surface gone (canSlide collapse, or isSwipeOn off) with no onRelease:
  // an isSwipeOn-orphaned drag is ended as a passive snap here (a collapse is
  // recovered by reconciliation); either way the drag-origin refs are cleared so
  // the next drag starts clean. See docs/architecture/gesture.md.
  useEffect(() => {
    if (layout.canSlide && isSwipeOn) return;
    if (!isSwipeOn && layout.canSlide && originPositionRef.current !== null) {
      flushPendingStart();
      const releasePosition = readCurrentPosition();
      const releaseTarget = resolveDragRelease({
        direction: "none",
        releasePosition,
        dragOriginPageIndex: originPageIndexRef.current,
        isInFlightGrab: isInFlightGrabRef.current,
        pressedPageIndex: pressedPageIndexRef.current,
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
        launchVelocity: 0,
        releasedAt: motionNow(),
      });
    }
    pendingStartRef.current = null;
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    originPositionRef.current = null;
    slotSizeRef.current = 0;
  }, [dispatch, flushPendingStart, isSwipeOn, layout, readCurrentPosition]);

  // Content-normalized engine tuning against the measured slot (see doc).
  const swipeConfig = useMemo(
    () => resolveSlotAdaptiveSwipeConfig(config.swipeConfig, slotPx),
    [config.swipeConfig, slotPx],
  );

  // Menu-vs-scroll discriminator: contextmenu fires just as the menu opens.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onContextMenu = () => {
      contextMenuSeenRef.current = true;
    };
    viewport.addEventListener("contextmenu", onContextMenu);
    return () => viewport.removeEventListener("contextmenu", onContextMenu);
  }, [viewportRef]);

  // Unmount: the deferred dispatch may not outlive us.
  useEffect(
    () => () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      pendingStartRef.current = null;
    },
    [],
  );

  const { hostProps } = usePointerSwipe({
    enabled: layout.canSlide && isSwipeOn,
    hostRef: viewportRef,
    surfaceRef: trackRef,
    config: swipeConfig,
    onPressStart: (payload) => startDragFromCurrentPosition(payload.pressClientX),
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onRelease: handleRelease,
  });

  return { hostProps };
}
