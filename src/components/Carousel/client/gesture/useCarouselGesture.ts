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
  /** The TRACK — the draggable surface. Declared positively so chrome layered
   * inside the viewport (Controls arrows, overlays) never touches a running
   * ride; a slide press still brakes the deck (slides live inside the track). */
  trackRef: RefObject<HTMLDivElement | null>;
  layout: CarouselLayout;
  /**
   * Public gesture switch (`isSwipeOn` prop). When `false` the pointer-swipe
   * primitive attaches NO listeners at all — the viewport carries zero
   * pointer handlers, as if the gesture surface did not exist.
   */
  isSwipeOn: boolean;
  /** Pending destination of an in-flight ride, `null` while idle. A drag that
   * grabs a moving deck anchors its origin page here (not the nearest-by-
   * geometry page), making a repeat swipe progress-independent like a repeated
   * click. See docs/architecture/gesture.md. */
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
  trackRef,
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
  // Whether THIS drag grabbed an in-flight ride (anchor = the ride's
  // destination), and which page the finger LANDED on. A directionless
  // release of an in-flight grab settles onto the pressed page — the slide
  // under the finger is what the user (and the browser's long-press menu)
  // is looking at (see resolveDragRelease).
  const isInFlightGrabRef = useRef(false);
  const pressedPageIndexRef = useRef<number | null>(null);
  // Did the context menu open during THIS gesture? It ends the gesture like an
  // external cancel, but must settle differently from a scroll hand-off: a
  // menu-hold lands on the pressed slide, a scroll resumes the interrupted ride.
  const contextMenuSeenRef = useRef(false);
  const slotSizeRef = useRef(0);

  // PRESS-COMMIT DEFERRAL: the track grab is synchronous, but the START_DRAG
  // dispatch moves to its own task so its render can't block the first frames
  // of a fast swipe. Order is preserved — every dependent dispatch flushes the
  // pending START_DRAG first. See docs/architecture/gesture.md.
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

    // Which page the finger LANDED on: press X → slot lane under the finger →
    // its page. One rect read, at interaction start only (the engine itself
    // reads offsetWidth at press). Falls back to null when unmeasurable —
    // the release then resolves through the anchor.
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
    dispatch,
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
      // A directionless END of an owned in-flight grab means one of two things:
      //  - the hold was deliberate (a lift, or the long-press menu opening):
      //    settle onto the PRESSED slide — what the eye and the menu look at;
      //  - the touch turned out to be a page scroll crossing the strip (the
      //    engine saw vertical intent, or the browser stole the pointer with
      //    no menu open): the catch was a false positive — RESUME the
      //    interrupted ride to its own destination instead of re-routing it.
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
        // null falls back to the anchor — the interrupted ride's destination.
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

  // The menu-vs-scroll discriminator for external cancels (see
  // contextMenuSeenRef): the contextmenu event fires on the host right as the
  // long-press menu opens, before the pointer is cancelled.
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
