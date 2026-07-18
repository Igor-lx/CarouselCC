import { sampleProgressStops } from "../../../../shared";

/**
 * Shared reading of a motion plan by its CONSUMERS.
 *
 * Every consumer of the plan channel does the same two things with the
 * percent-progress stops — the track (pixels), the pagination widget (dot
 * steps) and the plain pagination (the look of fixed dots):
 *
 *  - turn the stops into WAAPI keyframes by evaluating its own domain at the
 *    position the plan has reached at each stop (`keyframesAlongStops`);
 *  - ask where that position is RIGHT NOW, mid-flight, when a new plan
 *    arrives and the old one must be continued from (`positionAtNow`).
 *
 * Both are pure and domain-agnostic; each consumer supplies the mapping from
 * a position to whatever it paints. Keeping them here rather than in any one
 * consumer is what stops the three from drifting apart.
 */

/** A plan slice a consumer is currently running. */
export interface InFlightSpan {
  from: number;
  to: number;
  duration: number;
  /** Plan clock origin (`performance.now()` domain). */
  startedAt: number;
  stops: readonly number[];
}

/**
 * Where the span has reached at `now` — sampled from the curve itself, never
 * read back from the DOM. A finished (or degenerate) span reads as its end.
 */
export const positionAtNow = (span: InFlightSpan, now: number): number => {
  const fraction = span.duration > 0 ? (now - span.startedAt) / span.duration : 1;
  return span.from + (span.to - span.from) * sampleProgressStops(span.stops, fraction);
};

/**
 * One keyframe per stop: the i-th is `evaluate` applied to the position the
 * plan has reached by `stops[i]`. Uniform time offsets with linear
 * interpolation between them — the exact transport every consumer already
 * used, so no easing function is involved and any `Element.animate` engine
 * runs the profile.
 */
export const keyframesAlongStops = <T>(
  from: number,
  to: number,
  stops: readonly number[],
  evaluate: (position: number) => T,
): T[] => {
  const span = to - from;
  const frames: T[] = new Array(stops.length);
  for (let i = 0; i < stops.length; i += 1) {
    frames[i] = evaluate(from + span * stops[i]!);
  }
  return frames;
};
