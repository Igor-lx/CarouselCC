import { clamp } from "./clamp";
import {
  normalizeMotionProfileShares,
  sampleMotionProfile,
  type MotionProfile,
} from "./profile";

/**
 * Progress-curve sampling — the bridge that lets ANY accel/cruise/decel
 * motion profile run on the compositor thread.
 *
 * The engine computes a `MotionProfile` once (zones, speeds, duration). This
 * module renders that profile's *temporal shape* into a percent domain:
 * uniform samples of distance-progress (0..1) over time-progress (0..1). The
 * normalized curve is consumer-agnostic — the track maps it onto N page
 * screens of pixels, the pagination widget onto one dot step — which is what
 * keeps every consumer synchronized while travelling different distances.
 *
 * The stops are delivered to the compositor as WAAPI KEYFRAMES (one keyframe
 * per stop, evenly distributed, default linear interpolation between them) —
 * deliberately NOT as a CSS `linear()` easing, which would express the same
 * piecewise-linear curve but only on 2023+ engines. Keyframes make every
 * engine with `Element.animate` (~2015+) run the exact same curve; only
 * engines with no WAAPI at all fall back to the JS per-frame path.
 */

/**
 * Serialization density of a curve, in TIME — not a fixed sample count.
 *
 * The browser interpolates LINEARLY between keyframes, so a serialized curve
 * is a polyline: position error is tiny (~h²·|f''|/8, sub-pixel at any sane
 * density), but VELOCITY is piecewise-CONSTANT and steps at every stop. What
 * the eye reads is that step, and its visibility depends on how long a
 * segment lasts, not on how many there are.
 *
 * A fixed count therefore degrades exactly where it must not: at 32 intervals
 * a 300 ms flick spends 9 ms per segment (invisible, sub-frame) while a
 * 2000 ms button ride spends 62 ms — four whole frames of constant velocity,
 * then a jump. Slow, smooth rides are precisely where a human tracks the
 * motion and reads the steps as stuttering.
 *
 * So the density is pinned to the frame instead: one stop per ~16 ms of ride,
 * clamped. Every linear segment then lasts at most one frame, the compositor
 * samples it at most once, and no step can survive into a second frame at any
 * duration. A 2 s ride costs ~125 stops — numbers in a keyframe list, free
 * for the compositor.
 */
const TARGET_MS_PER_PROGRESS_STOP = 16;
const MIN_PROGRESS_STOP_INTERVALS = 32;
const MAX_PROGRESS_STOP_INTERVALS = 256;

/** Stop count for a ride of `duration` ms (see the density note above). */
export const resolveProgressStopIntervals = (duration: number): number => {
  if (!(duration > 0)) return MIN_PROGRESS_STOP_INTERVALS;
  return Math.min(
    MAX_PROGRESS_STOP_INTERVALS,
    Math.max(
      MIN_PROGRESS_STOP_INTERVALS,
      Math.ceil(duration / TARGET_MS_PER_PROGRESS_STOP),
    ),
  );
};

/**
 * Uniform distance-progress samples of a profile: index `i` is the progress
 * at time `duration * i / (stops - 1)`. First stop is exactly 0, last exactly
 * 1, and the sequence is forced monotonic so float noise can never serialize
 * a backwards step.
 */
export const profileProgressStops = (
  profile: MotionProfile,
  distance: number,
  intervals: number = resolveProgressStopIntervals(profile.duration),
): number[] => {
  const absDistance = Math.abs(distance);
  if (!(profile.duration > 0) || !(absDistance > 0) || !(intervals >= 1)) {
    return [0, 1];
  }

  const stops: number[] = new Array(intervals + 1);
  stops[0] = 0;
  for (let i = 1; i < intervals; i += 1) {
    const elapsed = (profile.duration * i) / intervals;
    const sampled = sampleMotionProfile(profile, elapsed, absDistance);
    const progress = clamp(sampled.distanceProgress, 0, 1);
    stops[i] = Math.max(progress, stops[i - 1]!);
  }
  stops[intervals] = 1;
  return stops;
};

/**
 * Piecewise-linear read of a stops array at `timeFraction` (0..1) — the same
 * interpolation the browser applies between the keyframes built from the
 * stops. Used by consumers that need the current progress of a running
 * compositor animation without reading the DOM (e.g. the widget re-planning
 * a step from its mid-flight position).
 */
export const sampleProgressStops = (
  stops: readonly number[],
  timeFraction: number,
): number => {
  const count = stops.length;
  if (count === 0) return 1;
  if (count === 1) return stops[0]!;
  const u = clamp(timeFraction, 0, 1) * (count - 1);
  const lower = Math.floor(u);
  const upper = Math.min(count - 1, lower + 1);
  const t = u - lower;
  return stops[lower]! + (stops[upper]! - stops[lower]!) * t;
};

/**
 * Re-sample a stops array to a COARSER uniform grid, on the same curve.
 *
 * Serialization density is chosen for the widest-travelling consumer (the
 * one where a velocity step is visible at all — see the density note above).
 * A consumer whose element travels a few pixels — a pagination dot — reads
 * no step at any density, yet pays the full price: one keyframe per stop,
 * per element, built on every ride. Handing it a coarser grid of the SAME
 * curve keeps every consumer on one temporal shape while cutting that cost.
 *
 * Uniform in time and exact at both ends, so a re-sampled curve stays
 * synchronized with the full-density one it came from.
 */
export const resampleStops = (
  stops: readonly number[],
  intervals: number,
): number[] => {
  if (!(intervals >= 1) || stops.length <= intervals + 1) return [...stops];
  const out: number[] = new Array(intervals + 1);
  for (let i = 0; i <= intervals; i += 1) {
    out[i] = sampleProgressStops(stops, i / intervals);
  }
  out[0] = stops[0] ?? 0;
  out[intervals] = stops[stops.length - 1] ?? 1;
  return out;
};

/**
 * Peak speed that makes an accel/cruise/decel profile cover `distance` in
 * exactly `duration` (duration-authored motions: click step, autoplay step,
 * snap-back, non-inertial gesture release).
 *
 * With zone shares a/c/d (normalized), start speed s0 and end speed 0, the
 * zone times sum to
 *   T = 2aD/(s0+p) + cD/p + 2dD/p
 * which rearranges into the quadratic
 *   T·p² + (T·s0 − 2aD − (c+2d)D)·p − (c+2d)·D·s0 = 0
 * whose positive root is the peak. When the handed-off `startSpeed` already
 * exceeds the solved peak, the profile builder raises the peak to cover it
 * and the segment simply arrives earlier than `duration` — continuity of the
 * visible motion wins over exact timing.
 */
export const resolvePeakSpeedForDuration = ({
  distance,
  duration,
  startSpeed,
  accelerationDistanceShare,
  decelerationDistanceShare,
}: {
  distance: number;
  duration: number;
  startSpeed: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}): number => {
  const absDistance = Math.abs(distance);
  if (!(absDistance > 0) || !(duration > 0)) return 0;

  const { accelerationShare, decelerationShare, cruiseShare } =
    normalizeMotionProfileShares(
      accelerationDistanceShare,
      decelerationDistanceShare,
    );
  const s0 = Math.max(0, startSpeed);

  const tailDistance = (cruiseShare + 2 * decelerationShare) * absDistance;
  const a = duration;
  const b = duration * s0 - 2 * accelerationShare * absDistance - tailDistance;
  const c = -tailDistance * s0;

  const discriminant = b * b - 4 * a * c;
  const root = (-b + Math.sqrt(Math.max(0, discriminant))) / (2 * a);
  return Math.max(0, root);
};

/** A plan slice a consumer is currently running: the span a motion travels
 * plus the temporal curve it travels it on. */
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
 * The consumer-side twin of `profileProgressStops`: whoever runs a stop-encoded
 * motion needs this the moment a NEW motion arrives mid-flight and must be
 * continued from the live position.
 */
export const positionAtNow = (span: InFlightSpan, now: number): number => {
  const fraction = span.duration > 0 ? (now - span.startedAt) / span.duration : 1;
  return span.from + (span.to - span.from) * sampleProgressStops(span.stops, fraction);
};

/**
 * One keyframe per stop: the i-th is `evaluate` applied to the position the
 * motion has reached by `stops[i]`. Uniform time offsets with linear
 * interpolation between them — the same delivery `profileProgressStops` was
 * designed for, closing the transport loop inside the engine: produce the
 * stops here, turn them into keyframes here. Each consumer supplies only the
 * mapping from a position to whatever it paints (pixels, projections,
 * opacities), which is what keeps this domain-agnostic.
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

let waapiSupport: boolean | null = null;

/**
 * Cached capability check for the Web Animations API — the ONLY gate between
 * the compositor path and the per-frame JS fallback. Keyframe-encoded curves
 * need nothing newer than `Element.animate` itself.
 */
export const isWaapiSupported = (): boolean => {
  if (waapiSupport === null) {
    waapiSupport =
      typeof Element !== "undefined" &&
      typeof Element.prototype.animate === "function";
  }
  return waapiSupport;
};
