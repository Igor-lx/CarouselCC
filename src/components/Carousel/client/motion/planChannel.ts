// Motion-plan channel: one plan per segment, published on a plain observable
// (never re-renders React); each paint consumer builds its own animation.
// See docs/architecture/motion.md
export type MotionPlanDirection = -1 | 0 | 1;

interface MotionPlanBase {
  /** Monotonic publish counter — lets a consumer detect any re-plan. */
  planId: number;
}

/** Deck is at rest (or motion disabled): finalize and hold. */
export interface IdleMotionPlan extends MotionPlanBase {
  kind: "idle";
}

/** Per-frame follow: a finger drag, or the JS fallback path. */
export interface FollowMotionPlan extends MotionPlanBase {
  kind: "follow";
  /** `true` for the no-WAAPI fallback (frame-skip relief), `false` for a drag. */
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
  /** Total one-step-consumer duration (ms); spans preflight + approach for a far GO_TO. */
  duration: number;
  /** Uniform time-samples of the percent-progress curve (encoded as keyframes). */
  stops: readonly number[];
  /** Segment clock origin — pin WAAPI `startTime` to it so consumers run in phase. */
  startedAt: number;
  /** Logical destination identity; a re-plan with the same key retimes the current step. */
  targetKey: number;
  /** Post-teleport approach slice — one-step consumers ignore continuations. */
  isContinuation: boolean;
  /** Segment is a GO_TO: a jumping consumer must cross-fade directly (structural, not magnitude). */
  isJump: boolean;
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
  publish: (plan: PublishableMotionPlan) => void;
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
    publish: (plan) => {
      // Steady-state dedupe: repeat idle / same-flavour follow are no-ops.
      if (plan.kind === "idle" && current.kind === "idle") return;
      if (
        plan.kind === "follow" &&
        current.kind === "follow" &&
        current.isFallback === plan.isFallback
      ) {
        return;
      }
      current = { ...plan, planId: nextId };
      nextId += 1;
      listeners.forEach((listener) => listener(current));
    },
  };
}
