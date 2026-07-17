import { useEffect, useRef } from "react";

import {
  motionNow,
  profileProgressStops,
  type MotionController,
  type MotionProfile,
  type MotionSample,
} from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { MotionPlanChannel, MotionPlanSource } from "./planChannel";
import { sampleCarouselSegment } from "./sampler";
import {
  buildBrakeSegment,
  buildResumeSegment,
  profileSpeedAtDistanceProgress,
} from "./yieldSegment";
import type { CarouselMotionStrategy, CarouselSegment } from "./types";

export interface UseScrollRideYieldInput {
  controller: MotionController<CarouselMotionStrategy>;
  config: CarouselRuntimeConfig;
  startCompositorMotion: TrackBindingApi["startCompositorMotion"];
  cancelCompositorMotion: TrackBindingApi["cancelCompositorMotion"];
  publishPlan: MotionPlanChannel["publish"];
  planSource: MotionPlanSource;
  onSettle: (settledPosition: number) => void;
}

/** What the brake stashed for the quiet-time resume: the REPLACED ride's own
 * curve. The resume returns the ride to the speed this curve prescribes at
 * the point where the strip then is — never to the instantaneous speed the
 * brake happened to sample (a brake in the deceleration tail would otherwise
 * freeze a decaying speed as the new cruise, and the arrival would read
 * slower than the ride "should" have been). */
interface ActiveYield {
  profile: MotionProfile;
  from: number;
  to: number;
}

/**
 * Keyframe density for yield curves. The default 32-interval grid is authored
 * for profiles whose curvature spreads over the whole duration; a yield curve
 * concentrates ALL of it in a short time-ramp at the head of a long crawl, so
 * on a multi-second segment the uniform 32-grid leaves the ramp only 2–3
 * keyframes and the eye reads the polyline as an abrupt, angular stop. One
 * stop per display frame period makes the piecewise-linear approximation
 * invisible; the cap bounds keyframe cost on very long crawls (the spacing
 * then widens, but only ever inside the crawl, where the curve is flat).
 * Implementation granularity, not a feel knob.
 */
const YIELD_STOP_SPACING_MS = 17;
const YIELD_MAX_STOP_INTERVALS = 160;

const yieldStopIntervals = (duration: number): number =>
  Math.min(
    YIELD_MAX_STOP_INTERVALS,
    Math.max(32, Math.ceil(duration / YIELD_STOP_SPACING_MS)),
  );

/**
 * Mid-ride graceful yield to page scrolling — the perceptual complement of
 * the autoplay tick deferral (PERF-INVESTIGATION §9.3/§9.4).
 *
 * WHY: when the mobile browser toolbar settles after a scroll, the system
 * display compositor aggregates two live surfaces and page frames miss the
 * presentation latch for 2–3 vsyncs (measured: 33–50 ms present gaps at
 * every scroll stop). A strip CRUISING through that window visibly bounces;
 * a strip moving slowly is unaffected — the held frame is imperceptible.
 * The page cannot prevent the stall, but it can not be fast during it.
 *
 * WHAT: on the first page-scroll signal while a ride is in flight, the ride
 * is re-timed through an atomic handoff into a brake segment — ramp to a
 * crawl, crawl on toward the SAME destination. Signals arriving during the
 * scroll and the chrome settle keep re-arming a quiet timer (a resting
 * finger holds the slow-mo — the resume waits for the lift); when the tail
 * goes silent the ride ramps back to the speed its ORIGINAL curve prescribed
 * for the point it has crawled to, and finishes normally. Same mechanism as
 * a repeated-click retarget: the old compositor animation carries the pixels
 * until the new one replaces it.
 *
 * Triggers are PAGE-SCROLL signals only (window scroll, window resize,
 * visualViewport resize) — never touch events: a horizontal swipe on the
 * carousel itself never moves the browser chrome, so a gesture ride must not
 * brake itself. Structural cause, not a heuristic.
 *
 * DELIBERATELY RENDER-FREE: everything runs imperatively inside event
 * listeners on refs — the same law as useViewportBusy. A React state flip on
 * a scroll signal would re-render the deck in the middle of the exact window
 * this hook exists to keep calm.
 *
 * Scope guard (structural, not magnitude-based): GO_TO slices (strategy
 * "jump") are excluded — a far GO_TO is a preflight/teleport/approach chain
 * whose widget plan is authored over the WHOLE command; re-timing one slice
 * would desynchronize the chain. Every plain ride (step, gesture release,
 * repeated click) yields, whatever its tuning.
 */
export function useScrollRideYield({
  controller,
  config,
  startCompositorMotion,
  cancelCompositorMotion,
  publishPlan,
  planSource,
  onSettle,
}: UseScrollRideYieldInput): void {
  const inputRef = useRef({
    controller,
    config,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan,
    planSource,
    onSettle,
  });
  inputRef.current = {
    controller,
    config,
    startCompositorMotion,
    cancelCompositorMotion,
    publishPlan,
    planSource,
    onSettle,
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const yieldRef = { current: null as ActiveYield | null };
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let isSelfPublishing = false;
    let fingersOnGlass = 0;

    const clearQuietTimer = () => {
      if (quietTimer !== null) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
    };

    /** Mirror of the runner's paint start: compositor first, controller as
     * the passive SSOT, plan re-published as a retiming of the SAME step. */
    const applySegment = (segment: CarouselSegment) => {
      const {
        startCompositorMotion: startMotion,
        cancelCompositorMotion: cancelMotion,
        controller: motion,
        publishPlan: publish,
        planSource: plans,
        onSettle: settle,
      } = inputRef.current;

      const stops = profileProgressStops(
        segment.profile,
        segment.to - segment.from,
        yieldStopIntervals(segment.duration),
      );
      const isComposited = startMotion({
        from: segment.from,
        to: segment.to,
        duration: segment.duration,
        stops,
        startedAt: segment.startedAt,
      });
      if (!isComposited) cancelMotion(segment.from);

      motion.start({
        segment,
        sampler: sampleCarouselSegment,
        onComplete: (sample: MotionSample<CarouselMotionStrategy>) =>
          settle(sample.value),
        isPassive: isComposited,
      });

      // Re-plan for one-step consumers (the pagination widget): same
      // targetKey — a retiming of the running step, never a new step. The
      // widget re-anchors from its live mid-flight offset and runs the new
      // curve in phase with the track.
      const plan = plans.getSnapshot();
      isSelfPublishing = true;
      try {
        if (isComposited && plan.kind === "waapi") {
          publish({
            kind: "waapi",
            direction: plan.direction,
            duration: segment.duration,
            stops,
            startedAt: segment.startedAt,
            targetKey: plan.targetKey,
            isContinuation: plan.isContinuation,
          });
        } else if (!isComposited) {
          publish({ kind: "follow", isFallback: true });
        }
      } finally {
        isSelfPublishing = false;
      }
    };

    const engage = () => {
      const { controller: motion, config: cfg } = inputRef.current;
      if (!motion.isActive()) return;

      const handoff = motion.captureHandoff(motionNow());
      if (handoff.strategy === "jump" || handoff.strategy === "idle") return;

      // The active segment's destination: the last emitted sample's target is
      // `segment.to` for the whole life of the segment (the initial start
      // emit for a passive ride, every frame for the fallback).
      const target = motion.getSnapshot().target;
      if (Math.abs(target - handoff.position) < cfg.motion.epsilon) return;

      // Stash the ride's own curve BEFORE the brake replaces it — it stays
      // the authority on the speeds the ride "should" have had (see resume).
      const replaced = motion.getActiveSegment() as CarouselSegment | null;
      if (!replaced) return;

      const brake = buildBrakeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        settings: cfg.scrollYield,
      });
      if (!brake) return;

      yieldRef.current = {
        profile: replaced.profile,
        from: replaced.from,
        to: replaced.to,
      };
      applySegment(brake.segment);
    };

    const resume = () => {
      const active = yieldRef.current;
      yieldRef.current = null;
      if (!active) return;

      const { controller: motion, config: cfg } = inputRef.current;
      // The crawl may have settled on its own, or a new command may have
      // replaced the ride (the plan subscription clears the yield then, but
      // an idle controller is the last-line guard).
      if (!motion.isActive()) return;

      const handoff = motion.captureHandoff(motionNow());
      if (handoff.strategy === "jump" || handoff.strategy === "idle") return;
      const target = motion.getSnapshot().target;
      if (Math.abs(target - handoff.position) < cfg.motion.epsilon) return;

      // The cruise to return to: what the ORIGINAL curve prescribed for the
      // point the strip has crawled to by now — never below the current
      // speed, so the ramp never dips before rising.
      const originalSpan = active.to - active.from;
      const prescribedSpeed = profileSpeedAtDistanceProgress(
        active.profile,
        originalSpan,
        originalSpan !== 0 ? (handoff.position - active.from) / originalSpan : 1,
      );

      const segment = buildResumeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        cruiseSpeed: prescribedSpeed,
        settings: cfg.scrollYield,
      });
      if (segment) applySegment(segment);
    };

    // Self-extending quiet window: every scroll frame and every chrome resize
    // during the settle pushes the resume out; the delay only has to cover
    // the silent tail after the LAST signal. A quiet that arrives while a
    // finger still rests on the glass does NOT resume — the scroll merely
    // paused under the finger, and the hand still owns the viewport; the
    // window re-arms at the lift instead. A fling that outlives the lift
    // resolves through the scroll signals alone (fingers are already zero).
    const armQuietTimer = () => {
      clearQuietTimer();
      quietTimer = setTimeout(() => {
        quietTimer = null;
        if (fingersOnGlass > 0) return; // the lift will re-arm
        resume();
      }, inputRef.current.config.scrollYield.resumeQuietDelayMs);
    };

    const onScrollSignal = () => {
      if (yieldRef.current === null) engage();
      if (yieldRef.current !== null) armQuietTimer();
    };

    // Touch listeners maintain the finger count ONLY — a touch never engages
    // the yield (a swipe on the deck itself must not brake its own ride; the
    // structural trigger stays the page-scroll signal).
    const onTouchStart = (event: TouchEvent) => {
      fingersOnGlass = event.touches.length;
    };
    const onTouchSettle = (event: TouchEvent) => {
      fingersOnGlass = event.touches.length;
      if (fingersOnGlass === 0 && yieldRef.current !== null) armQuietTimer();
    };

    // Any plan publish that is not ours means the engine replaced or ended
    // the ride we re-timed — the stashed cruise no longer describes anything.
    const unsubscribePlans = inputRef.current.planSource.subscribe(() => {
      if (isSelfPublishing) return;
      if (yieldRef.current !== null) {
        yieldRef.current = null;
        clearQuietTimer();
      }
    });

    const touchOptions = { capture: true, passive: true } as const;
    window.addEventListener("scroll", onScrollSignal, { passive: true });
    window.addEventListener("resize", onScrollSignal);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onScrollSignal);
    document.addEventListener("touchstart", onTouchStart, touchOptions);
    document.addEventListener("touchend", onTouchSettle, touchOptions);
    document.addEventListener("touchcancel", onTouchSettle, touchOptions);

    return () => {
      window.removeEventListener("scroll", onScrollSignal);
      window.removeEventListener("resize", onScrollSignal);
      viewport?.removeEventListener("resize", onScrollSignal);
      document.removeEventListener("touchstart", onTouchStart, touchOptions);
      document.removeEventListener("touchend", onTouchSettle, touchOptions);
      document.removeEventListener("touchcancel", onTouchSettle, touchOptions);
      unsubscribePlans();
      clearQuietTimer();
      yieldRef.current = null;
    };
  }, []);
}
