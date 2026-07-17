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

/** What the brake stashed for the quiet-time resume. */
interface ActiveYield {
  /** The ride's along-track speed at the brake point — the resume cruise. */
  entrySpeed: number;
}

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
 * scroll and the chrome settle keep re-arming a quiet timer; when the tail
 * goes silent the ride is re-timed again back to its pre-brake cruise and
 * finishes normally. Same mechanism as a repeated-click retarget: the old
 * compositor animation carries the pixels until the new one replaces it.
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

      const stops = profileProgressStops(segment.profile, segment.to - segment.from);
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

      const brake = buildBrakeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        settings: cfg.scrollYield,
      });
      if (!brake) return;

      yieldRef.current = { entrySpeed: brake.entrySpeed };
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

      const segment = buildResumeSegment({
        position: handoff.position,
        velocity: handoff.velocity,
        target,
        strategy: handoff.strategy,
        startedAt: handoff.timestamp,
        cruiseSpeed: active.entrySpeed,
        shares: cfg.scrollYield.resumeProfile,
      });
      if (segment) applySegment(segment);
    };

    const onScrollSignal = () => {
      if (yieldRef.current === null) engage();
      if (yieldRef.current !== null) {
        // Self-extending quiet window: every scroll frame and every chrome
        // resize during the settle pushes the resume out; the delay only has
        // to cover the silent tail after the LAST signal.
        clearQuietTimer();
        quietTimer = setTimeout(() => {
          quietTimer = null;
          resume();
        }, inputRef.current.config.scrollYield.resumeQuietDelayMs);
      }
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

    window.addEventListener("scroll", onScrollSignal, { passive: true });
    window.addEventListener("resize", onScrollSignal);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onScrollSignal);

    return () => {
      window.removeEventListener("scroll", onScrollSignal);
      window.removeEventListener("resize", onScrollSignal);
      viewport?.removeEventListener("resize", onScrollSignal);
      unsubscribePlans();
      clearQuietTimer();
      yieldRef.current = null;
    };
  }, []);
}
