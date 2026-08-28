// See ../README.md § Curve math + WAAPI transport.
import { clamp } from "./clamp";
import { sampleMotionProfile, type MotionProfile } from "./profile";

// Density derived from the curve so the relative velocity step stays ~5%
// regardless of duration/refresh (see README). Clamped to [32, 256].
const MAX_RELATIVE_VELOCITY_STEP = 0.05;
const MIN_PROGRESS_STOP_INTERVALS = 32;
const MAX_PROGRESS_STOP_INTERVALS = 256;

/** Stop count for one profile (see the density note above). */
export const resolveProgressStopIntervals = (profile: MotionProfile): number => {
  if (!(profile.duration > 0) || profile.zones.length === 0) {
    return MIN_PROGRESS_STOP_INTERVALS;
  }

  let peakSpeed = 0;
  let peakAcceleration = 0;
  for (const zone of profile.zones) {
    peakSpeed = Math.max(peakSpeed, zone.startSpeed, zone.endSpeed);
    if (!(zone.duration > 0)) continue;
    peakAcceleration = Math.max(
      peakAcceleration,
      (1.5 * Math.abs(zone.endSpeed - zone.startSpeed)) / zone.duration,
    );
  }

  // Pure cruise has no velocity step to hide; the floor is enough.
  if (!(peakSpeed > 0) || !(peakAcceleration > 0)) {
    return MIN_PROGRESS_STOP_INTERVALS;
  }

  const interval = (MAX_RELATIVE_VELOCITY_STEP * peakSpeed) / peakAcceleration;
  return clamp(
    Math.ceil(profile.duration / interval),
    MIN_PROGRESS_STOP_INTERVALS,
    MAX_PROGRESS_STOP_INTERVALS,
  );
};

/** Uniform distance-progress samples (0..1); forced monotonic, ends exact. */
export const profileProgressStops = (
  profile: MotionProfile,
  distance: number,
  intervals: number = resolveProgressStopIntervals(profile),
): number[] => {
  const absDistance = Math.abs(distance);
  if (!(profile.duration > 0) || !(absDistance > 0) || !(intervals >= 1)) {
    return [0, 1];
  }

  const stops: number[] = new Array<number>(intervals + 1);
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

/** Piecewise-linear read of a stops array (same as the browser's keyframe interp). */
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

/** Re-sample stops to a coarser uniform grid on the same curve (see README). */
export const resampleStops = (
  stops: readonly number[],
  intervals: number,
): number[] => {
  if (!(intervals >= 1) || stops.length <= intervals + 1) return [...stops];
  const out: number[] = new Array<number>(intervals + 1);
  for (let i = 0; i <= intervals; i += 1) {
    out[i] = sampleProgressStops(stops, i / intervals);
  }
  out[0] = stops[0] ?? 0;
  out[intervals] = stops[stops.length - 1] ?? 1;
  return out;
};

/** Peak speed so the profile covers `distance` in `duration` (quadratic root; see README). */
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

  // Shares trusted as-is; over-allocation → negative cruise, mirroring the builder.
  const accelerationShare = accelerationDistanceShare;
  const decelerationShare = decelerationDistanceShare;
  const cruiseShare = 1 - accelerationShare - decelerationShare;
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

/** Where the span has reached at `now`, sampled from the curve (never the DOM). */
export const positionAtNow = (span: InFlightSpan, now: number): number => {
  const fraction = span.duration > 0 ? (now - span.startedAt) / span.duration : 1;
  return span.from + (span.to - span.from) * sampleProgressStops(span.stops, fraction);
};

/** One keyframe per stop; the consumer supplies only position → its own paint value. */
export const keyframesAlongStops = <T>(
  from: number,
  to: number,
  stops: readonly number[],
  evaluate: (position: number) => T,
): T[] => {
  const span = to - from;
  const frames: T[] = new Array<T>(stops.length);
  for (let i = 0; i < stops.length; i += 1) {
    frames[i] = evaluate(from + span * stops[i]!);
  }
  return frames;
};

let waapiSupport: boolean | null = null;

/** Cached WAAPI capability check — the only gate to the compositor path. */
export const isWaapiSupported = (): boolean => {
  if (waapiSupport === null) {
    waapiSupport =
      typeof Element !== "undefined" &&
      typeof Element.prototype.animate === "function";
  }
  return waapiSupport;
};
