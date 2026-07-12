import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import {
  nearestPageIndex,
  pointerVelocityToVirtual,
  resolveDragRelease,
  type CarouselLayout,
} from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { resolveSlotAdaptiveSwipeConfig } from "./slotAdaptiveSwipe";
import { useMeasuredSlotSize } from "../geometry";
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
  layout: CarouselLayout;
  /**
   * Public gesture switch (`isSwipeOn` prop). When `false` the pointer-swipe
   * primitive attaches NO listeners at all — the viewport carries zero
   * pointer handlers, as if the gesture surface did not exist.
   */
  isSwipeOn: boolean;
  /**
   * The pending destination of an in-flight ride, `null` while idle. A drag
   * that GRABS a moving deck anchors its origin page here instead of the
   * nearest-by-geometry page: otherwise a repeat swipe early in a ride
   * (visual < 50% of a page) would round back to the ride's start page and
   * merely re-target the ALREADY incoming page — while the same swipe past
   * 50% (and every repeated click, uniformly) advances one page beyond it.
   * Anchoring on the pending target makes the repeat gesture progress-
   * independent, exactly like the repeated click.
   */
  inFlightTargetPageIndex: number | null;
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
  inFlightTargetPageIndex,
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

  // PRESS-COMMIT DEFERRAL. The follow stream needs no React at all (positions
  // are written straight to style), but the START_DRAG render used to run
  // INSIDE the press task — on a weak device that single long task blocked
  // frame presentation for the first ~30-80ms of a fast swipe, reading as
  // "content does not follow, then rides after lift-off". The track grab
  // stays fully synchronous; only the dispatch moves to its own task, opening
  // a presentation slot between them. ORDER IS GUARANTEED: every dependent
  // dispatch site flushes the pending START_DRAG synchronously first, so the
  // reducer always sees START before END — on a gesture faster than the
  // deferral both land in one task (and one commit), which is semantically
  // the same release the reducer would have processed anyway.
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
    // In-flight grab: anchor on the interrupted ride's destination (see the
    // input doc); idle grab: the geometric nearest page.
    const pageIndex = inFlightTargetPageIndex ?? nearestPageIndex(origin, layout);

    originPositionRef.current = origin;
    originPageIndexRef.current = pageIndex;

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
    dispatch,
    getSlotSize,
    inFlightTargetPageIndex,
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
      // Reducer-order guarantee: START_DRAG always lands before END_DRAG.
      flushPendingStart();
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
        // The runner's takeover coasts the launch position over the commit
        // gap measured from this clock reading (see gesture/coast.ts).
        releasedAt: motionNow(),
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
      flushPendingStart();
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
        releasedAt: motionNow(),
      });
    }
    // A layout collapse drops an undispatched grab entirely: the reducer
    // never learned of it, and reconciliation owns the recovery.
    pendingStartRef.current = null;
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    originPositionRef.current = null;
    slotSizeRef.current = 0;
  }, [dispatch, flushPendingStart, isSwipeOn, layout, readCurrentPosition]);

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
    config: swipeConfig,
    onPressStart: startDragFromCurrentPosition,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onRelease: handleRelease,
  });

  return { hostProps };
}
