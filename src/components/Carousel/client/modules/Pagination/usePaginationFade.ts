import { useCallback, useEffect, useRef } from "react";

import { motionNow, useIsomorphicLayoutEffect } from "../../../../../shared";
import {
  sampleProgressStops,
  type CarouselMotionPlan,
  type MotionPlanSource,
} from "../../motion";
import {
  buildDotKeyframes,
  dotActiveStrength,
  reachedDotIndexes,
  type DotVisualState,
} from "./fadeKeyframes";

/**
 * Engine-driven dot binding — the third consumer of the motion plan (track:
 * pixels, widget: dot steps, pagination: the LOOK of fixed dots).
 *
 * The model is the widget's, in a different domain: one continuous `offset`
 * travels from the page being left to the page being entered along the plan's
 * percent-progress stops, over the plan's duration, pinned to the plan's
 * clock; each dot's look is a function of its distance from that offset (see
 * fadeKeyframes). Because there is exactly ONE motion and ONE clock, a page
 * merely passed through by a repeated click rises to the active look and falls
 * again in step with the deck — no separate, faster curve is authored for it.
 *
 * React flips the `dotActive` class to the target page immediately on every
 * command; the animations mask that flip while a planned motion runs, and the
 * class styles underneath are exactly the values the animations end on.
 *
 * Non-planned changes (mount, drag target flips, the no-WAAPI fallback,
 * reduced motion where the plan source is null) keep the plain CSS transition.
 */

const FALLBACK_INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const FALLBACK_ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };

/** Below this the dot shows nothing for the whole step — pin it instead of
 * paying for an animation that paints no difference (the widget's rule). */
const INVISIBLE_STRENGTH = 0.001;

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
  const parsed = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The dot look is CSS-owned (custom properties on the wrapper); read the
 * same three vars the classes consume so the animation and the resting styles
 * can never disagree. */
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
      scale: readVar(styles, "--pagination-dot-scale-active", FALLBACK_ACTIVE.scale),
    },
  };
};

/** The step currently in flight — everything needed to resolve where the
 * offset is RIGHT NOW without reading the DOM (the widget's practice). */
interface ActiveStep {
  from: number;
  to: number;
  duration: number;
  startedAt: number;
  stops: readonly number[];
}

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
  const callbacksRef = useRef<Array<((node: HTMLElement | null) => void) | null>>([]);
  const animationsRef = useRef(new Map<number, Animation>());

  /** Where the carousel LOOKS to be, in pages — fractional while a step runs. */
  const offsetRef = useRef(targetPageIndex);
  const stepRef = useRef<ActiveStep | null>(null);
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
   * properties these animations drive. Whenever the active-dot class moves,
   * that transition fires, and Blink is left with two effects on one property:
   * it cannot composite that, so it drops the animation onto the main thread
   * for the rest of the ride, dragging a full paint lifecycle through every
   * frame.
   *
   * The cascade still picks the animation, so the picture stays correct —
   * which is exactly why the cost stayed invisible. Measured on a Redmi Note
   * 11S, suppressing the transition for the duration takes a ride from 452
   * main frames (2696 ms) down to 12 (81 ms). See PERF-INVESTIGATION §3.5.
   */
  const suppressTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    if (dot) dot.style.transition = "none";
  }, []);

  const restoreTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    // Back to the stylesheet: the transition still owns every non-planned flip.
    if (dot) dot.style.transition = "";
  }, []);

  /** One motion owns the whole strip, so cancellation is always collective:
   * after the cancel the class styles underneath already hold exactly the
   * values the animations ended on, so restoring transitions nothing. */
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

  /** Where the offset is now: sampled from the running step's own curve —
   * never read back from the DOM. */
  const liveOffset = useCallback(() => {
    const step = stepRef.current;
    if (!step) return offsetRef.current;
    const fraction =
      step.duration > 0 ? (motionNow() - step.startedAt) / step.duration : 1;
    return step.from + (step.to - step.from) * sampleProgressStops(step.stops, fraction);
  }, []);

  const settle = useCallback(
    (landedOn: number) => {
      offsetRef.current = landedOn;
      stepRef.current = null;
      cancelAllFades();
    },
    [cancelAllFades],
  );

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          // A far-GO_TO approach slice: the preflight plan already spans the
          // whole command for one-step consumers.
          if (plan.isContinuation) return;

          const from = liveOffset();
          const to = targetRef.current;
          if (from === to) return;

          const anyDot = dotRefs.current.find((dot) => dot) ?? null;
          if (!anyDot) {
            settle(to);
            return;
          }
          const { inactive, active } = readDotStates(anyDot);

          // One motion for the whole strip: every dot the offset passes near
          // gets the SAME curve over the SAME duration on the SAME clock.
          cancelAllFades();
          for (const index of reachedDotIndexes(from, to, pageCount)) {
            const dot = dotRefs.current[index];
            if (!dot) continue;

            // A dot the offset never comes within a step of paints nothing all
            // the way through — leave it to its class styles.
            const staysInvisible =
              plan.stops.every(
                (p) =>
                  dotActiveStrength(index - (from + (to - from) * p)) <=
                  INVISIBLE_STRENGTH,
              ) && index !== to;
            if (staysInvisible) continue;

            suppressTransition(index);
            let animation: Animation;
            try {
              animation = dot.animate(
                buildDotKeyframes(index, from, to, plan.stops, inactive, active),
                { duration: plan.duration, fill: "both" },
              );
            } catch {
              // No keyframe support: hand the dot back to the class flip + CSS
              // transition, which produce an acceptable instant-ish switch.
              restoreTransition(index);
              continue;
            }
            try {
              animation.startTime = plan.startedAt;
            } catch {
              // play-pending fallback keeps the animation, merely unpinned.
            }
            animationsRef.current.set(index, animation);

            // The destination dot outlives every other: settle on its finish.
            if (index === to) {
              animation.onfinish = () => {
                if (animationsRef.current.get(index) !== animation) return;
                settle(to);
              };
            }
          }

          stepRef.current = {
            from,
            to,
            duration: plan.duration,
            startedAt: plan.startedAt,
            stops: plan.stops,
          };
          return;
        }
        case "instant":
        case "idle":
        case "follow": {
          // Snap / rest / finger-follow (or the no-WAAPI fallback): the class
          // flip plus the plain CSS transition own the dots.
          settle(targetRef.current);
          return;
        }
      }
    },
    [liveOffset, pageCount, restoreTransition, settle, suppressTransition, cancelAllFades],
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
