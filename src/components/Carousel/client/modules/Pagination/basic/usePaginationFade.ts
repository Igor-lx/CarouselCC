import { useCallback, useEffect, useRef } from "react";

import { motionNow, useIsomorphicLayoutEffect } from "../../../../../../shared";
import {
  positionAtNow,
  startPinnedAnimation,
  type CarouselMotionPlan,
  type InFlightSpan,
  type MotionPlanSource,
} from "../../../motion";
import {
  blendDotStates,
  buildDotKeyframes,
  dotActiveStrength,
  dotKeyframesBetween,
  dotStateAt,
  offsetDistance,
  reachedDotIndexes,
  resolveOffsetTarget,
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

interface UsePaginationFadeInput {
  motionPlan: MotionPlanSource | null;
  targetPageIndex: number;
  pageCount: number;
  /** Cyclic decks have no ends: a step off page 0 lands on the last page one
   * step away, and the offset must travel that way, not across the strip. */
  isFinite: boolean;
}

export interface PaginationFadeBinding {
  /** Accepts either element: a non-interactive dot renders as a <div>. */
  bindDotRef: (pageIndex: number) => (node: HTMLElement | null) => void;
}

/**
 * The motion currently masking the class flip.
 * - `sweep`: the offset TRAVELS the span — steps, repeats, wraps; passed-over
 *   pages light up because the offset really visits them.
 * - `direct`: each involved dot cross-fades straight to its final look —
 *   GO_TO, where the deck teleports its middle and the dots must not tour
 *   pages the deck never shows. The span runs 0 → 1, so `positionAtNow` on
 *   it yields plain temporal progress for mid-flight continuation.
 */
interface ActiveFade {
  span: InFlightSpan;
  kind: "sweep" | "direct";
  /** direct only: the endpoints each animated dot travels between. */
  blends: Map<number, { from: DotVisualState; to: DotVisualState }> | null;
  /** The page the motion lands on (in range) — the offset a direct fade
   * reports while running, since it has no travelling position. */
  landing: number;
}

export function usePaginationFade({
  motionPlan,
  targetPageIndex,
  pageCount,
  isFinite,
}: UsePaginationFadeInput): PaginationFadeBinding {
  const dotRefs = useRef<Array<HTMLElement | null>>([]);
  const callbacksRef = useRef<Array<((node: HTMLElement | null) => void) | null>>([]);
  const animationsRef = useRef(new Map<number, Animation>());

  /** Where the carousel LOOKS to be, in pages — fractional while a step runs. */
  const offsetRef = useRef(targetPageIndex);
  const stepRef = useRef<ActiveFade | null>(null);
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

  /** Where the offset is now: sampled from the running motion's own curve —
   * never read back from the DOM. A direct fade has no travelling offset (the
   * deck teleported), so it reports its landing page. */
  const liveOffset = useCallback(() => {
    const fade = stepRef.current;
    if (!fade) return offsetRef.current;
    if (fade.kind === "direct") return fade.landing;
    return positionAtNow(fade.span, motionNow());
  }, []);

  const settle = useCallback(
    (landedOn: number) => {
      // Normalise: a cyclic step may have taken the offset past either end.
      offsetRef.current =
        pageCount > 0 ? ((landedOn % pageCount) + pageCount) % pageCount : landedOn;
      stepRef.current = null;
      cancelAllFades();
    },
    [cancelAllFades, pageCount],
  );

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          // A far-GO_TO approach slice: the preflight plan already spans the
          // whole command for one-step consumers.
          if (plan.isContinuation) return;

          const anyDot = dotRefs.current.find((dot) => dot) ?? null;
          if (!anyDot) {
            settle(targetRef.current);
            return;
          }
          const { inactive, active } = readDotStates(anyDot);

          // GO_TO: the deck TELEPORTS its middle, so the dots must not tour
          // it. Each involved dot cross-fades straight to its final look —
          // still on the plan's curve, duration and clock, so the landing dot
          // arrives WITH the picture exactly as a swept one does.
          if (plan.isJump) {
            const target = targetRef.current;
            const previous = stepRef.current;
            // Continue from what the PREVIOUS motion has painted by now,
            // resolved from its own curve (never the DOM): a sweep gives an
            // offset to evaluate dots at, a direct fade gives per-dot blends
            // at its temporal progress.
            const previousProgress =
              previous?.kind === "direct"
                ? positionAtNow(previous.span, motionNow())
                : null;
            const previousOffset =
              previous?.kind === "sweep"
                ? positionAtNow(previous.span, motionNow())
                : offsetRef.current;
            const startStateOf = (index: number): DotVisualState => {
              if (previous?.kind === "direct") {
                const blend = previous.blends?.get(index);
                return blend
                  ? blendDotStates(blend.from, blend.to, previousProgress!)
                  : dotStateAt(index, previous.landing, inactive, active, pageCount, isFinite);
              }
              return dotStateAt(index, previousOffset, inactive, active, pageCount, isFinite);
            };

            const blends = new Map<number, { from: DotVisualState; to: DotVisualState }>();
            for (let index = 0; index < pageCount; index += 1) {
              const fromState = startStateOf(index);
              const toState = index === target ? active : inactive;
              const isAlreadyThere =
                Math.abs(fromState.opacity - toState.opacity) < 1e-3 &&
                Math.abs(fromState.scale - toState.scale) < 1e-3;
              if (!isAlreadyThere) blends.set(index, { from: fromState, to: toState });
            }

            cancelAllFades();
            if (blends.size === 0) {
              settle(target);
              return;
            }

            let settleOwner: Animation | null = null;
            for (const [index, blend] of blends) {
              const dot = dotRefs.current[index];
              if (!dot) continue;
              suppressTransition(index);
              const animation = startPinnedAnimation(
                dot,
                dotKeyframesBetween(blend.from, blend.to, plan.stops),
                { duration: plan.duration, startedAt: plan.startedAt },
              );
              if (!animation) {
                // No keyframe support: back to the class flip + CSS
                // transition — an acceptable instant-ish switch.
                restoreTransition(index);
                continue;
              }
              animationsRef.current.set(index, animation);
              // The landing dot preferred; any animation will do if the
              // target happens to already look active.
              if (index === target || settleOwner === null) settleOwner = animation;
            }
            if (settleOwner) {
              const owner = settleOwner;
              owner.onfinish = () => {
                if (![...animationsRef.current.values()].includes(owner)) return;
                settle(target);
              };
            }

            stepRef.current = {
              span: {
                from: 0,
                to: 1,
                duration: plan.duration,
                startedAt: plan.startedAt,
                stops: plan.stops,
              },
              kind: "direct",
              blends,
              landing: target,
            };
            return;
          }

          const from = liveOffset();
          const to = resolveOffsetTarget(
            from,
            targetRef.current,
            pageCount,
            plan.direction,
            isFinite,
          );
          if (from === to) return;

          // One motion for the whole strip: every dot the offset passes near
          // gets the SAME curve over the SAME duration on the SAME clock.
          cancelAllFades();
          for (const index of reachedDotIndexes(from, to, pageCount, isFinite)) {
            const dot = dotRefs.current[index];
            if (!dot) continue;

            // A dot the offset never comes within a step of paints nothing all
            // the way through — leave it to its class styles.
            const staysInvisible =
              plan.stops.every(
                (p) =>
                  dotActiveStrength(
                    offsetDistance(
                      index,
                      from + (to - from) * p,
                      pageCount,
                      isFinite,
                    ),
                  ) <= INVISIBLE_STRENGTH,
              ) && index !== targetRef.current;
            if (staysInvisible) continue;

            suppressTransition(index);
            const animation = startPinnedAnimation(
              dot,
              buildDotKeyframes(
                index,
                from,
                to,
                plan.stops,
                inactive,
                active,
                pageCount,
                isFinite,
              ),
              { duration: plan.duration, startedAt: plan.startedAt },
            );
            if (!animation) {
              // No keyframe support: hand the dot back to the class flip + CSS
              // transition, which produce an acceptable instant-ish switch.
              restoreTransition(index);
              continue;
            }
            animationsRef.current.set(index, animation);

            // The destination dot outlives every other: settle on its finish.
            if (index === targetRef.current) {
              animation.onfinish = () => {
                if (animationsRef.current.get(index) !== animation) return;
                settle(to);
              };
            }
          }

          stepRef.current = {
            span: {
              from,
              to,
              duration: plan.duration,
              startedAt: plan.startedAt,
              stops: plan.stops,
            },
            kind: "sweep",
            blends: null,
            landing: targetRef.current,
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
    [
      cancelAllFades,
      isFinite,
      liveOffset,
      pageCount,
      restoreTransition,
      settle,
      suppressTransition,
    ],
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
