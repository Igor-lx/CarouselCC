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
 * Uniform time-samples per serialized curve. 32 intervals keep the
 * piecewise-linear approximation error of a smoothstep-shaped profile well
 * under 0.2% of the travelled distance — sub-pixel for any realistic track.
 * Implementation granularity, not a feel knob.
 */
const PROGRESS_STOP_INTERVALS = 32;

/**
 * Uniform distance-progress samples of a profile: index `i` is the progress
 * at time `duration * i / (stops - 1)`. First stop is exactly 0, last exactly
 * 1, and the sequence is forced monotonic so float noise can never serialize
 * a backwards step.
 */
export const profileProgressStops = (
  profile: MotionProfile,
  distance: number,
  intervals: number = PROGRESS_STOP_INTERVALS,
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
