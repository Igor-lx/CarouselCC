import { useCallback, useEffect, useRef } from "react";

import {
  motionNow,
  resampleStops,
  useIsomorphicLayoutEffect,
} from "../../../../../../shared";
import { mod } from "../../../domain";
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

// Engine-driven dot binding — the third consumer of the motion plan (dot LOOK).
// See docs/architecture/modules.md

const FALLBACK_INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const FALLBACK_ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };

/** Below this a dot paints nothing for the whole step — pin it, don't animate. */
const INVISIBLE_STRENGTH = 0.001;

const DOT_CURVE_INTERVALS = 32;

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
  const parsed = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Dot look is CSS-owned; read the same vars the classes use so they can't disagree.
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
  isFinite: boolean;
}

export interface PaginationFadeBinding {
  bindDotRef: (pageIndex: number) => (node: HTMLElement | null) => void;
}

/** The motion masking the class flip: `sweep` travels the span (passed pages
 * light up); `direct` cross-fades straight (GO_TO teleports the middle). */
interface ActiveFade {
  span: InFlightSpan;
  kind: "sweep" | "direct";
  blends: Map<number, { from: DotVisualState; to: DotVisualState }> | null;
  /** The landing page — what a direct fade reports (it has no travelling offset). */
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

  // Reading the CSS-owned look forces a recalc, so cache it; refresh only at rest.
  const dotStatesRef = useRef<{ inactive: DotVisualState; active: DotVisualState } | null>(null);

  const refreshDotStates = useCallback(() => {
    const anyDot = dotRefs.current.find((dot) => dot) ?? null;
    if (anyDot) dotStatesRef.current = readDotStates(anyDot);
  }, []);
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

  // Load-bearing: suppress the dot's CSS transition for the ride or Blink drops
  // the animation to the main thread. Do NOT remove (see modules.md).
  const suppressTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    if (dot) dot.style.transition = "none";
  }, []);

  const restoreTransition = useCallback((pageIndex: number) => {
    const dot = dotRefs.current[pageIndex];
    if (dot) dot.style.transition = "";
  }, []);

  // Collective cancel — the class styles already hold the end values.
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

  // Sampled from the running curve, never the DOM; a direct fade reports its landing.
  const liveOffset = useCallback(() => {
    const fade = stepRef.current;
    if (!fade) return offsetRef.current;
    if (fade.kind === "direct") return fade.landing;
    return positionAtNow(fade.span, motionNow());
  }, []);

  const settle = useCallback(
    (landedOn: number) => {
      offsetRef.current = pageCount > 0 ? mod(landedOn, pageCount) : landedOn;
      stepRef.current = null;
      cancelAllFades();
      refreshDotStates(); // re-read the CSS look at rest (theme/breakpoint change)
    },
    [cancelAllFades, pageCount, refreshDotStates],
  );

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          if (plan.isContinuation) return; // preflight already spans the command

          const anyDot = dotRefs.current.find((dot) => dot) ?? null;
          if (!anyDot) {
            settle(targetRef.current);
            return;
          }
          // A dot travels a few px, so it rides a coarser re-sample of the curve.
          const dotStops = resampleStops(plan.stops, DOT_CURVE_INTERVALS);
          if (!dotStatesRef.current) refreshDotStates();
          const { inactive, active } = dotStatesRef.current ?? readDotStates(anyDot);

          // GO_TO teleports the middle → dots cross-fade straight (direct), still
          // on the plan's curve/clock so the landing dot arrives with the picture.
          if (plan.isJump) {
            const target = targetRef.current;
            const previous = stepRef.current;
            // Continue from the previous motion's own curve (never the DOM).
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
                dotKeyframesBetween(blend.from, blend.to, dotStops),
                { duration: plan.duration, startedAt: plan.startedAt },
              );
              if (!animation) {
                restoreTransition(index); // no keyframe support: class flip
                continue;
              }
              animationsRef.current.set(index, animation);
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

          // One motion for the whole strip: same curve/duration/clock per dot.
          cancelAllFades();
          for (const index of reachedDotIndexes(from, to, pageCount, isFinite)) {
            const dot = dotRefs.current[index];
            if (!dot) continue;

            // A dot the offset never nears paints nothing — leave it to its
            // class styles. Scanned on the coarse grid the dot actually rides.
            const staysInvisible =
              dotStops.every(
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
                dotStops,
                inactive,
                active,
                pageCount,
                isFinite,
              ),
              { duration: plan.duration, startedAt: plan.startedAt },
            );
            if (!animation) {
              restoreTransition(index); // no keyframe support: class flip
              continue;
            }
            animationsRef.current.set(index, animation);

            // The destination dot outlives the rest: settle on its finish.
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
          // Snap / rest / follow / fallback: the class flip + CSS transition own the dots.
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
