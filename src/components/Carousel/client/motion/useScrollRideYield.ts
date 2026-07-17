import { useEffect, useRef } from "react";

import {
  motionNow,
  profileProgressStops,
  type MotionController,
  type MotionSample,
} from "../../../../shared";
import type { CarouselRuntimeConfig } from "../config";
import type { TrackBindingApi } from "../geometry";
import type { MotionPlanChannel, MotionPlanSource } from "./planChannel";
import { sampleCarouselSegment } from "./sampler";
import { buildBrakeSegment, buildResumeSegment } from "./yieldSegment";
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

/** What the dive stashed for the exit: the speed it dropped from (the exit
 * ramps symmetrically back up to it) and the ride's own duration (the tempo
 * the exit ramp scales off). Deliberately NOT the original profile — the
 * yield is a self-contained visual; the exit does not consult the ride's
 * shape, only its speed and tempo. */
interface ActiveYield {
  entrySpeed: number;
  rideDurationMs: number;
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
 * WHAT ("vinyl brake"): on the first page-scroll signal while a ride is in
 * flight, the ride is re-timed through an atomic handoff into a DIVE segment
 * — an ease-out ramp down to a crawl (steepest at the very start, so it drops
 * into slow-mo the instant the scroll begins), then crawl on toward the SAME
 * destination. The EXIT is event-driven for responsiveness: the moment the
 * finger lifts with the scroll already settled, the ride ramps (ease-out,
 * symmetric) back up to the speed it dived from and finishes — no delay, the
 * record spins free under the released finger. A resting finger HOLDS the
 * slow-mo; a fling that outlives the lift exits when the scroll goes idle
 * (a short ≈2-frame detector). Same mechanism as a repeated-click retarget:
 * the old compositor animation carries the pixels until the new one replaces
 * it. The dive/exit ramp durations are PROPORTIONAL to the ride's own tempo,
 * so the effect is one self-contained visual across every ride kind.
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
    let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
    let isSelfPublishing = false;
    let fingersOnGlass = 0;
    let lastScrollSignalAt = -Infinity;

    const clearScrollIdleTimer = () => {
      if (scrollIdleTimer !== null) {
        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = null;
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

      // The ride's authored duration — the tempo the dive/exit ramps scale
      // off. Read before the brake replaces the active segment.
      const replaced = motion.getActiveSegment() as CarouselSegment | null;
      if (!replaced) return;

      const brake = buildBrakeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        rideDurationMs: replaced.duration,
        settings: cfg.scrollYield,
      });
      if (!brake) return;

      yieldRef.current = {
        entrySpeed: brake.entrySpeed,
        rideDurationMs: replaced.duration,
      };
      applySegment(brake.segment);
    };

    const resume = () => {
      clearScrollIdleTimer();
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

      // Symmetric exit: ramp back up to the speed the dive dropped from — the
      // yield is a self-contained visual, so we do NOT consult the original
      // ride's shape, only the speed it was travelling and its tempo.
      const segment = buildResumeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        rideDurationMs: active.rideDurationMs,
        cruiseSpeed: active.entrySpeed,
        settings: cfg.scrollYield,
      });
      if (segment) applySegment(segment);
    };

    // The exit is EVENT-driven, not delay-driven — a finger lift with the
    // scroll already idle resumes on the touch event itself (no "залипон").
    // The scroll-idle timer is only a fling-settle DETECTOR: it fires
    // `scrollIdleMs` (≈2 frames) after the LAST scroll signal, and resumes
    // only if no finger is left on the glass. A finger still down means the
    // hand is holding the slow-mo — the lift will resume it.
    const armScrollIdleTimer = () => {
      clearScrollIdleTimer();
      scrollIdleTimer = setTimeout(() => {
        scrollIdleTimer = null;
        if (fingersOnGlass > 0) return; // the lift resumes it
        resume();
      }, inputRef.current.config.scrollYield.scrollIdleMs);
    };

    const onScrollSignal = () => {
      lastScrollSignalAt = motionNow();
      if (yieldRef.current === null) engage();
      if (yieldRef.current !== null) armScrollIdleTimer();
    };

    // Touch listeners maintain the finger count ONLY — a touch never engages
    // the yield (a swipe on the deck itself must not brake its own ride; the
    // structural trigger stays the page-scroll signal).
    const onTouchStart = (event: TouchEvent) => {
      fingersOnGlass = event.touches.length;
    };
    const onTouchSettle = (event: TouchEvent) => {
      fingersOnGlass = event.touches.length;
      if (fingersOnGlass > 0 || yieldRef.current === null) return;
      // Last finger up. If the scroll has already settled, the record spins
      // free NOW — resume on this very event. If a fling is still running
      // (scroll signals still arriving), let the idle detector catch its end.
      const scrollIdle =
        motionNow() - lastScrollSignalAt >= inputRef.current.config.scrollYield.scrollIdleMs;
      if (scrollIdle) resume();
    };

    // Any plan publish that is not ours means the engine replaced or ended
    // the ride we re-timed — the stashed speed no longer describes anything.
    const unsubscribePlans = inputRef.current.planSource.subscribe(() => {
      if (isSelfPublishing) return;
      if (yieldRef.current !== null) {
        yieldRef.current = null;
        clearScrollIdleTimer();
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
      clearScrollIdleTimer();
      yieldRef.current = null;
    };
  }, []);
}
