import { useCallback, useEffect, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../../../shared";
import type { CarouselMotionPlan, MotionPlanSource } from "../../motion";
import { buildFadeKeyframes, type DotVisualState } from "./fadeKeyframes";

/**
 * Engine-driven cross-fade for the pagination dots — the third consumer of
 * the motion plan (track: pixels, widget: dot steps, pagination: OPACITY).
 *
 * React flips the `dotActive` class to the target page immediately on every
 * command; this binding masks that flip for planned motions with two WAAPI
 * animations — the outgoing dot fades to its resting look, the incoming dot
 * fades to the active look — built from the plan's percent-progress stops,
 * over the plan's duration, pinned to the plan's clock. The dot therefore
 * arrives WITH the picture (decelerating on the same curve), which is what
 * the old fixed "switch after 30% of the autoplay" delay only approximated.
 *
 * Non-planned changes (mount, drag target flips, the no-WAAPI fallback,
 * reduced motion where the plan source is null) keep the plain CSS
 * transition / static rendering.
 */

const FALLBACK_INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const FALLBACK_ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
  const parsed = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The dot look is CSS-owned (custom properties on the wrapper); read the
 * same three vars the classes consume so the fade and the resting styles can
 * never disagree. */
const readDotStates = (
  element: HTMLElement,
): { inactive: DotVisualState; active: DotVisualState } => {
  const styles = getComputedStyle(element);
  return {
    inactive: {
      opacity: readVar(styles, "--pagination-dot-opacity", FALLBACK_INACTIVE.opacity),
      scale: 1,
    },
    active: {
      opacity: readVar(
        styles,
        "--pagination-dot-opacity-active",
        FALLBACK_ACTIVE.opacity,
      ),
      scale: readVar(
        styles,
        "--pagination-dot-scale-active",
        FALLBACK_ACTIVE.scale,
      ),
    },
  };
};

/** Mid-fade retarget: continue from what is actually painted (the live
 * animation's current values), not from the logical endpoint. */
const readLiveState = (element: HTMLElement): DotVisualState => {
  const styles = getComputedStyle(element);
  const opacity = Number.parseFloat(styles.opacity);
  const matrix = new DOMMatrixReadOnly(styles.transform);
  return {
    opacity: Number.isFinite(opacity) ? opacity : FALLBACK_INACTIVE.opacity,
    scale: matrix.a || 1,
  };
};

interface UsePaginationFadeInput {
  motionPlan: MotionPlanSource | null;
  targetPageIndex: number;
  pageCount: number;
}

export interface PaginationFadeBinding {
  /** Accepts either element: a non-interactive dot renders as a <div>. */
  bindDotRef: (pageIndex: number) => (node: HTMLElement | null) => void;
}

export function usePaginationFade({
  motionPlan,
  targetPageIndex,
  pageCount,
}: UsePaginationFadeInput): PaginationFadeBinding {
  const dotRefs = useRef<Array<HTMLElement | null>>([]);
  const callbacksRef = useRef<
    Array<((node: HTMLElement | null) => void) | null>
  >([]);
  const animationsRef = useRef(new Map<number, Animation>());

  /** The page whose dot currently LOOKS active (lags target while fading). */
  const displayedRef = useRef(targetPageIndex);
  const targetRef = useRef(targetPageIndex);
  targetRef.current = targetPageIndex;

  const bindDotRef = useCallback((pageIndex: number) => {
    const cached = callbacksRef.current[pageIndex];
    if (cached) return cached;
    const callback = (node: HTMLElement | null) => {
      dotRefs.current[pageIndex] = node;
    };
    callbacksRef.current[pageIndex] = callback;
    return callback;
  }, []);

  useIsomorphicLayoutEffect(() => {
    dotRefs.current.length = pageCount;
    callbacksRef.current.length = pageCount;
  }, [pageCount]);

  /**
   * The dot's CSS `transition` covers opacity and transform — the very two
   * properties the WAAPI fade animates. Whenever the active-dot class moves,
   * that transition fires, and Blink is left with two effects on one property:
   * it cannot composite that, so it drops the fade onto the main thread for the
   * rest of the ride, dragging a full paint lifecycle through every frame.
   *
   * The cascade still picks the animation, so the picture stays correct — which
   * is exactly why the cost stayed invisible. Measured on a Redmi Note 11S,
   * suppressing the transition for the duration of the fade takes a ride from
   * 452 main frames (2696 ms) down to 12 (81 ms).
   *
   * Suppressing also CANCELS a transition already in flight (a property that
   * leaves `transition-property` has its transition cancelled), so it is safe
   * whether the class flip lands before or after the plan arrives.
   */
  const suppressTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    if (dot) dot.style.transition = "none";
  }, []);

  const restoreTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    // Back to the stylesheet: the transition still owns every non-planned flip
    // (mount, drag retarget, the no-WAAPI fallback).
    if (dot) dot.style.transition = "";
  }, []);

  const cancelFade = useCallback(
    (pageIndex: number) => {
      const animation = animationsRef.current.get(pageIndex);
      if (!animation) return;
      animationsRef.current.delete(pageIndex);
      try {
        animation.cancel();
      } catch {
        // already gone
      }
      // After the cancel: the class styles underneath already hold exactly the
      // values the fade ended on, so restoring the transition here transitions
      // nothing.
      restoreTransition(pageIndex);
    },
    [restoreTransition],
  );

  const cancelAllFades = useCallback(() => {
    animationsRef.current.forEach((animation, pageIndex) => {
      try {
        animation.cancel();
      } catch {
        // already gone
      }
      restoreTransition(pageIndex);
    });
    animationsRef.current.clear();
  }, [restoreTransition]);

  const startFade = useCallback(
    (
      element: HTMLElement,
      pageIndex: number,
      from: DotVisualState,
      to: DotVisualState,
      plan: Extract<CarouselMotionPlan, { kind: "waapi" }>,
      onFinish?: () => void,
    ) => {
      cancelFade(pageIndex);

      // Before animate(), never after: this both cancels a transition the class
      // flip may have already started and stops the next one from starting, so
      // the fade is the ONLY effect on opacity/transform and can be composited.
      suppressTransition(pageIndex);

      let animation: Animation;
      try {
        animation = element.animate(buildFadeKeyframes(from, to, plan.stops), {
          duration: plan.duration,
          fill: "both",
        });
      } catch {
        // No keyframe support: hand the dot back to the class flip + CSS
        // transition, which produce an acceptable (instant-ish) switch.
        restoreTransition(pageIndex);
        return;
      }
      try {
        animation.startTime = plan.startedAt;
      } catch {
        // play-pending fallback keeps the fade, merely unpinned.
      }
      animationsRef.current.set(pageIndex, animation);
      if (onFinish) {
        animation.onfinish = () => {
          if (animationsRef.current.get(pageIndex) !== animation) return;
          onFinish();
        };
      }
    },
    [cancelFade, restoreTransition, suppressTransition],
  );

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          // A far-GO_TO approach slice: the preflight plan already spans the
          // whole command for one-step consumers.
          if (plan.isContinuation) return;
          const from = displayedRef.current;
          const to = targetRef.current;
          if (from === to) return;

          const outgoing = dotRefs.current[from];
          const incoming = dotRefs.current[to];
          const anyDot = outgoing ?? incoming;
          if (!anyDot) {
            displayedRef.current = to;
            return;
          }
          const states = readDotStates(anyDot);

          // Read live values BEFORE cancelling (cancel drops the fill and the
          // element snaps to its class styles).
          const outgoingFrom =
            outgoing && animationsRef.current.has(from)
              ? readLiveState(outgoing)
              : states.active;
          const incomingFrom =
            incoming && animationsRef.current.has(to)
              ? readLiveState(incoming)
              : states.inactive;

          if (outgoing) {
            startFade(outgoing, from, outgoingFrom, states.inactive, plan);
          }
          if (incoming) {
            startFade(incoming, to, incomingFrom, states.active, plan, () => {
              // Settle: drop both fills — the class styles beneath already
              // show exactly these final values.
              cancelFade(to);
              cancelFade(from);
            });
          }
          displayedRef.current = to;
          return;
        }
        case "instant":
        case "idle":
        case "follow": {
          // Snap / rest / finger-follow (or the no-WAAPI fallback): the class
          // flip plus the plain CSS transition own the dots.
          cancelAllFades();
          displayedRef.current = targetRef.current;
          return;
        }
      }
    },
    [cancelAllFades, cancelFade, startFade],
  );

  useIsomorphicLayoutEffect(() => {
    if (!motionPlan) return;
    const unsubscribe = motionPlan.subscribe(applyPlan);
    return () => {
      unsubscribe();
      cancelAllFades();
    };
  }, [applyPlan, cancelAllFades, motionPlan]);

  useEffect(() => () => cancelAllFades(), [cancelAllFades]);

  return { bindDotRef };
}
