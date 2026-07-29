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
  isDroppedFallbackFrame,
  type VisualPositionSource,
} from "../../../visual-position";
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
//
// One travelling offset owns the whole strip; every mode (WAAPI step, per-frame
// follow, rest) writes the SAME function of that offset, so a mode change is a
// change of who paints, never a change of where the strip sits.

// Substitutes for an unreadable CSS variable, so they MUST mirror the class's
// own values (Pagination.module.scss) — the whole point of the fade is to end
// exactly where the class picks the dot up.
const FALLBACK_INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const FALLBACK_ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.5 };

/** At or below this a dot paints nothing for the whole step — pin it, don't animate. */
const INVISIBLE_STRENGTH_MAX = 0.001;

const DOT_CURVE_INTERVALS = 32;

/** Per-frame follow write gate. It sits on the dimensionless active-strength,
 * not on the looks it drives, so it keeps its meaning under ANY declared
 * opacity/scale span (a near-flat span would swallow an absolute gate whole). */
const FOLLOW_STRENGTH_EPSILON = 1 / 512;

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
  /** Per-frame position stream — the follow mode's source (`null` under reduced motion). */
  visualPosition: VisualPositionSource | null;
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
  visualPosition,
  targetPageIndex,
  pageCount,
  isFinite,
}: UsePaginationFadeInput): PaginationFadeBinding {
  const dotRefs = useRef<Array<HTMLElement | null>>([]);
  const callbacksRef = useRef<Array<((node: HTMLElement | null) => void) | null>>([]);
  const animationsRef = useRef(new Map<number, Animation>());

  /** Dots whose inline layer (look + suppressed transition) the binding owns.
   * Non-empty exactly while a motion is in flight — at rest the classes own everything. */
  const ownedDotsRef = useRef(new Set<number>());
  /** Last strength WRITTEN per owned dot — the follow write gate's memory. */
  const writtenStrengthRef = useRef(new Map<number, number>());

  /** Where the carousel LOOKS to be, in pages — fractional while a step runs. */
  const offsetRef = useRef(targetPageIndex);
  const stepRef = useRef<ActiveFade | null>(null);
  const followUnsubRef = useRef<(() => void) | null>(null);
  const followBaseRef = useRef<{ pageOffset: number; offset: number } | null>(null);
  /** Which follow the live subscription is serving. A drag that releases into the
   * no-WAAPI path switches flavour WITHOUT a new subscription, and the frame-drop
   * rule has to switch with it or the strip outruns the track. */
  const isFallbackFollowRef = useRef(false);

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

  // Load-bearing: suppress the dot's CSS transition for as long as the binding
  // paints it, or Blink is left with two effects on one property and drops the
  // animation to the main thread. Do NOT remove (see modules.md). Idempotent, so
  // a dot that mounts mid-motion is claimed by the write that first reaches it.
  const takeDotOwnership = useCallback((pageIndex: number): HTMLElement | null => {
    const dot = dotRefs.current[pageIndex];
    if (!dot) return null;
    if (!ownedDotsRef.current.has(pageIndex)) {
      dot.style.transition = "none";
      ownedDotsRef.current.add(pageIndex);
    }
    return dot;
  }, []);

  /** Hand one dot back to its class styles — look AND transition, together. */
  const releaseDot = useCallback((pageIndex: number) => {
    ownedDotsRef.current.delete(pageIndex);
    writtenStrengthRef.current.delete(pageIndex);
    const dot = dotRefs.current[pageIndex];
    if (!dot) return;
    dot.style.opacity = "";
    dot.style.transform = "";
    dot.style.transition = "";
  }, []);

  // Collective hand-back — the class styles already hold the end values.
  const releaseAllDots = useCallback(() => {
    for (const pageIndex of [...ownedDotsRef.current]) releaseDot(pageIndex);
  }, [releaseDot]);

  // Cancel only: ownership outlives a re-plan, so the inline layer never blinks
  // back to the classes between two motions.
  const cancelAllFades = useCallback(() => {
    animationsRef.current.forEach((animation) => {
      try {
        animation.cancel();
      } catch {
        // already gone
      }
    });
    animationsRef.current.clear();
  }, []);

  // Sampled from the running curve, never the DOM; a direct fade reports its
  // landing, and follow mode reports the offset its last frame left behind.
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
      releaseAllDots();
      refreshDotStates(); // re-read the CSS look at rest (theme/breakpoint change)
    },
    [cancelAllFades, pageCount, refreshDotStates, releaseAllDots],
  );

  // ---- follow mode (finger drag / JS fallback) -------------------------------

  /** One frame of the strip: every dot's look read off its distance from the
   * offset — the same `dotStateAt` the sweep keyframes are built from. */
  const writeFollowOffset = useCallback(
    (offset: number) => {
      const states = dotStatesRef.current;
      if (!states) return;
      const written = writtenStrengthRef.current;

      for (let index = 0; index < pageCount; index += 1) {
        const strength = dotActiveStrength(
          offsetDistance(index, offset, pageCount, isFinite),
        );
        const last = written.get(index);
        // Gate on strength, paint from dotStateAt — one look function, one owner.
        if (last !== undefined && Math.abs(last - strength) <= FOLLOW_STRENGTH_EPSILON) {
          continue;
        }
        const dot = takeDotOwnership(index);
        if (!dot) continue;
        const state = dotStateAt(
          index,
          offset,
          states.inactive,
          states.active,
          pageCount,
          isFinite,
        );
        dot.style.opacity = String(state.opacity);
        dot.style.transform = `scaleX(${state.scale})`;
        written.set(index, strength);
      }
    },
    [isFinite, pageCount, takeDotOwnership],
  );

  const stopFollowing = useCallback(() => {
    followUnsubRef.current?.();
    followUnsubRef.current = null;
    followBaseRef.current = null;
  }, []);

  const startFollowing = useCallback(
    (isFallback: boolean) => {
      isFallbackFollowRef.current = isFallback;
      if (followUnsubRef.current || !visualPosition) return;

      // Take over from the LIVE offset, so a grab mid-ride keeps the position the
      // strip had reached instead of re-anchoring on the logical target.
      const start = liveOffset();
      cancelAllFades();
      stepRef.current = null;
      offsetRef.current = start;
      followBaseRef.current = null;
      if (!dotStatesRef.current) refreshDotStates();
      writtenStrengthRef.current.clear(); // WAAPI owned the look; the gate is blind
      // The first write claims EVERY dot: the class flip may sit anywhere on the
      // strip, and an unclaimed dot would keep painting it.
      writeFollowOffset(start);

      followUnsubRef.current = visualPosition.subscribe(
        (frame) => {
          // Delta-follow in the page domain: the deck's absolute position is not
          // the strip's (a cyclic wrap must not teleport the dots).
          if (followBaseRef.current === null) {
            followBaseRef.current = {
              pageOffset: frame.pageOffset,
              offset: offsetRef.current,
            };
          }
          const base = followBaseRef.current;
          const next = base.offset + (frame.pageOffset - base.pageOffset);
          offsetRef.current = next;

          // Fallback relief: the same shared frame-drop rule the track and the
          // widget apply, so the three consumers cannot desync.
          if (isFallbackFollowRef.current && isDroppedFallbackFrame(frame)) return;
          writeFollowOffset(next);
        },
        { emitCurrent: true },
      );
    },
    [
      cancelAllFades,
      liveOffset,
      refreshDotStates,
      visualPosition,
      writeFollowOffset,
    ],
  );

  // ---- plan routing -----------------------------------------------------------

  const applyPlan = useCallback(
    (plan: CarouselMotionPlan) => {
      switch (plan.kind) {
        case "waapi": {
          if (plan.isContinuation) return; // preflight already spans the command

          stopFollowing();

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
            // Drop any inline layer a preceding follow left: the animations below
            // re-take exactly the dots they paint, the rest fall back to their
            // classes — which already hold the look they were left at.
            releaseAllDots();
            if (blends.size === 0) {
              settle(target);
              return;
            }

            let settleOwner: Animation | null = null;
            for (const [index, blend] of blends) {
              const dot = takeDotOwnership(index);
              if (!dot) continue;
              const animation = startPinnedAnimation(
                dot,
                dotKeyframesBetween(blend.from, blend.to, dotStops),
                { duration: plan.duration, startedAt: plan.startedAt },
              );
              if (!animation) {
                releaseDot(index); // no keyframe support: class flip
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
          // Nothing to travel — but a preceding follow may still own the strip,
          // so this is a settle, not a bare return.
          if (from === to) {
            settle(to);
            return;
          }

          // One motion for the whole strip: same curve/duration/clock per dot.
          cancelAllFades();
          releaseAllDots();
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
                  ) <= INVISIBLE_STRENGTH_MAX,
              ) && index !== targetRef.current;
            if (staysInvisible) continue;

            takeDotOwnership(index);
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
              releaseDot(index); // no keyframe support: class flip
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
        case "follow": {
          // A finger on the deck, or the no-WAAPI fallback: the strip keeps
          // moving, per frame, from wherever it had got to.
          if (!visualPosition) {
            // No stream to follow. The carousel nulls both sources together, so
            // this is reachable only from a caller that splits them — hand the
            // dots back rather than leave a dead motion on screen.
            settle(targetRef.current);
            return;
          }
          startFollowing(plan.isFallback);
          return;
        }
        case "instant":
        case "idle": {
          // Snap / rest: the class flip + CSS transition own the dots again.
          stopFollowing();
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
      refreshDotStates,
      releaseAllDots,
      releaseDot,
      settle,
      startFollowing,
      stopFollowing,
      takeDotOwnership,
      visualPosition,
    ],
  );

  useIsomorphicLayoutEffect(() => {
    if (!motionPlan) return;
    const unsubscribe = motionPlan.subscribe(applyPlan);
    return () => {
      unsubscribe();
      stopFollowing();
      cancelAllFades();
      releaseAllDots();
    };
  }, [applyPlan, cancelAllFades, motionPlan, releaseAllDots, stopFollowing]);

  useEffect(
    () => () => {
      stopFollowing();
      cancelAllFades();
      releaseAllDots();
    },
    [cancelAllFades, releaseAllDots, stopFollowing],
  );

  return { bindDotRef };
}
