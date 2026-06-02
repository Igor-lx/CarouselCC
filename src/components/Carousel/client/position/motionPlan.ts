import type { CubicBezier } from "../motion/types";

/**
 * A composited motion plan: the one eased translation the deck is executing,
 * expressed once in the page-offset domain so any compositor mirror (the track,
 * the pagination widget) can reproduce it on the compositor thread instead of
 * writing per frame on the main thread.
 *
 * This is NOT a second source of truth. The JS `MotionController` remains the
 * sole SSOT of the live visual position (handoff, settle, status all read it).
 * A plan is a *derivative* the motion runner — the single `state → motion`
 * bridge — emits when it starts a compositor-eligible (easing) segment, so the
 * mirrors animate the same curve the controller samples. Profile segments
 * (inertial gesture release, repeated-click, GO_TO jump) and live drag are not
 * expressible as one eased curve; the runner publishes `null` for them and the
 * mirrors fall back to following the per-frame `VisualPositionSource`.
 */
export interface MotionPlan {
  /** Start page-offset of the eased sweep (deck position / visibleSlidesCount). */
  fromPageOffset: number;
  /** End page-offset of the eased sweep. */
  toPageOffset: number;
  /** Segment duration in milliseconds. */
  duration: number;
  /** The cubic-bezier easing the deck translation uses. */
  easing: CubicBezier;
  /**
   * Monotonic token, bumped on every publish (including `null` → clear). Lets a
   * mirror detect a new plan / cancellation without structural comparison.
   */
  version: number;
}

export type MotionPlanListener = (plan: MotionPlan | null) => void;

/**
 * Observable holder for the current {@link MotionPlan}. Per-carousel-instance,
 * referentially stable for the carousel's life (like `VisualPositionSource`),
 * so it can live in the stable module context without re-rendering consumers.
 */
export interface MotionPlanSource {
  getPlan(): MotionPlan | null;
  publish(plan: Omit<MotionPlan, "version"> | null): void;
  subscribe(listener: MotionPlanListener): () => void;
}

export const createMotionPlanSource = (): MotionPlanSource => {
  const listeners = new Set<MotionPlanListener>();
  let current: MotionPlan | null = null;
  let version = 0;

  return {
    getPlan: () => current,
    publish(plan) {
      version += 1;
      current = plan === null ? null : { ...plan, version };
      listeners.forEach((listener) => listener(current));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
