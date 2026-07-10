/**
 * Motion-plan channel — how the engine hands a computed motion to every
 * consumer that paints it.
 *
 * The motion runner (the only producer) computes each segment ONCE — profile,
 * duration, normalized percent-progress curve — and publishes a plan. Paint
 * consumers (the pagination widget's step, the pagination dots' cross-fade;
 * the track receives the same data directly through `startCompositorMotion`)
 * subscribe and build their own WAAPI animation from it: same `duration`,
 * same curve, same `startedAt` clock, their own animated property — pixels,
 * dot steps, opacity. Time-synchronized by construction, no per-frame work.
 *
 * The channel is a plain observable value on the stable module context — it
 * never re-renders React; consumers react inside effects/subscriptions.
 */

export type MotionPlanDirection = -1 | 0 | 1;

interface MotionPlanBase {
  /** Monotonic publish counter — lets a consumer detect any re-plan. */
  planId: number;
}

/** Deck is at rest (or motion disabled): finalize and hold. */
export interface IdleMotionPlan extends MotionPlanBase {
  kind: "idle";
}

/**
 * Per-frame follow mode: a finger owns the track (drag), or a segment runs on
 * the JS fallback path. Consumers subscribe to the visual-position stream and
 * follow it frame by frame — exactly the pre-engine behaviour.
 */
export interface FollowMotionPlan extends MotionPlanBase {
  kind: "follow";
  /**
   * `true` when the follow is the no-WAAPI legacy fallback (an engine-driven
   * segment painted per frame), `false` for a live finger drag. Consumers use
   * it to apply legacy-only relief (frame-skip) without throttling the drag.
   */
  isFallback: boolean;
}

/** Reduced-motion / layout-reconcile snap: jump to the outcome, no animation. */
export interface InstantMotionPlan extends MotionPlanBase {
  kind: "instant";
  direction: MotionPlanDirection;
}

/** A compositor-driven segment: everything needed to build a WAAPI animation. */
export interface WaapiMotionPlan extends MotionPlanBase {
  kind: "waapi";
  direction: MotionPlanDirection;
  /** Total planned duration for a one-step consumer (ms). For a far GO_TO this
   * spans preflight + approach, so a one-step consumer runs the whole command
   * as a single motion while the deck runs its two bounded segments. */
  duration: number;
  /** Uniform time-samples of the percent-progress curve. Consumers encode
   * them as WAAPI keyframes (one per stop, evenly distributed) and use
   * `sampleProgressStops` for reflow-free mid-flight reads. */
  stops: readonly number[];
  /** Segment clock origin (`performance.now()` domain) — pin WAAPI
   * `startTime` to it so every consumer runs in phase. */
  startedAt: number;
  /**
   * Identity of the deck's logical destination (target virtual index). A
   * re-plan with the SAME key is a retiming of the current step (repeated
   * click refresh, settle re-anchor) — a one-step consumer keeps its target.
   * A new key advances the consumer one step further.
   */
  targetKey: number;
  /**
   * True for the post-teleport approach slice of a far GO_TO. The command was
   * already planned in full by the preflight plan; one-step consumers ignore
   * continuations.
   */
  isContinuation: boolean;
}

export type CarouselMotionPlan =
  | IdleMotionPlan
  | FollowMotionPlan
  | InstantMotionPlan
  | WaapiMotionPlan;

export type MotionPlanListener = (plan: CarouselMotionPlan) => void;

export interface MotionPlanSource {
  getSnapshot(): CarouselMotionPlan;
  subscribe(listener: MotionPlanListener): () => void;
}

/** `Omit` distributed over a union, so each plan variant keeps its own shape
 * (a plain `Omit` would collapse the union to its common fields). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type PublishableMotionPlan = DistributiveOmit<CarouselMotionPlan, "planId">;

export interface MotionPlanChannel {
  source: MotionPlanSource;
  publish(plan: PublishableMotionPlan): void;
}

export function createMotionPlanChannel(): MotionPlanChannel {
  let current: CarouselMotionPlan = { kind: "idle", planId: 0 };
  let nextId = 1;
  const listeners = new Set<MotionPlanListener>();

  return {
    source: {
      getSnapshot: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    publish(plan) {
      // Steady-state dedupe: consecutive idle publishes (and follow publishes
      // of the same flavour) are no-ops for every consumer; waapi/instant
      // always notify (each is a new motion).
      if (plan.kind === "idle" && current.kind === "idle") return;
      if (
        plan.kind === "follow" &&
        current.kind === "follow" &&
        current.isFallback === plan.isFallback
      ) {
        return;
      }
      current = { ...plan, planId: nextId } as CarouselMotionPlan;
      nextId += 1;
      listeners.forEach((listener) => listener(current));
    },
  };
}
