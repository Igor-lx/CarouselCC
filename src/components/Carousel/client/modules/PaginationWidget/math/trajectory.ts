import { writeDotProjection } from "./projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "../types";

/**
 * WAAPI keyframe sampling for a widget step.
 *
 * The engine's plan carries the TEMPORAL shape (duration + percent-progress
 * easing). A dot's SPATIAL path across a step — position, scale, opacity as a
 * function of step progress — is nonlinear (per-slot interpolation, edge
 * drift, fades), so it cannot be one from/to keyframe pair. Instead the path
 * is sampled at uniform progress offsets into a keyframe list; the browser
 * interpolates linearly between keyframes while the animation's easing (the
 * plan's `linear()` curve) drives progress through them. Temporal profile and
 * spatial path stay cleanly separated: easing = when, keyframes = where.
 */

/** Uniform samples per step path. Enough that the exponential edge drift and
 * the fade bands stay visually smooth; a one-time cost per motion, not
 * per-frame work. */
const TRAJECTORY_INTERVALS = 24;

/** A type alias (not an interface) so it stays assignable to the DOM
 * `Keyframe` type's index signature. */
export type DotTrajectoryKeyframe = {
  transform: string;
  opacity: number;
};

const toTransform = (x: number, scale: number) =>
  `translate3d(${x}px, 0, 0) scale(${scale})`;

const scratch: PaginationWidgetDotState = {
  id: 0,
  x: 0,
  scale: 0,
  opacity: 0,
  activeStrength: 0,
  isActive: false,
};

const sampleTrajectory = (
  id: number,
  fromOffset: number,
  toOffset: number,
  geometry: PaginationWidgetGeometry,
  opacityOf: (state: PaginationWidgetDotState) => number,
  intervals: number,
): DotTrajectoryKeyframe[] => {
  const frames: DotTrajectoryKeyframe[] = new Array(intervals + 1);
  for (let i = 0; i <= intervals; i += 1) {
    const progress = i / intervals;
    const offset = fromOffset + (toOffset - fromOffset) * progress;
    const state = writeDotProjection(scratch, id, offset, geometry);
    frames[i] = {
      transform: toTransform(state.x, state.scale),
      opacity: opacityOf(state),
    };
  }
  return frames;
};

/** Keyframes of a regular dot (`id`) as the widget offset travels
 * `fromOffset -> toOffset`. */
export const sampleDotTrajectory = (
  id: number,
  fromOffset: number,
  toOffset: number,
  geometry: PaginationWidgetGeometry,
  intervals: number = TRAJECTORY_INTERVALS,
): DotTrajectoryKeyframe[] =>
  sampleTrajectory(
    id,
    fromOffset,
    toOffset,
    geometry,
    (state) => state.opacity,
    intervals,
  );

/** Keyframes of an active-highlight overlay for integer page `id`: same
 * spatial path, but its opacity is the active strength (1 at the exact page,
 * fading over one step distance). */
export const sampleActiveDotTrajectory = (
  id: number,
  fromOffset: number,
  toOffset: number,
  geometry: PaginationWidgetGeometry,
  intervals: number = TRAJECTORY_INTERVALS,
): DotTrajectoryKeyframe[] =>
  sampleTrajectory(
    id,
    fromOffset,
    toOffset,
    geometry,
    (state) => state.activeStrength,
    intervals,
  );

/** Integer overlay ids whose active strength can be non-zero anywhere along
 * the path `fromOffset -> toOffset` (strength reaches zero one full step away
 * from the live offset). */
export const activeTrajectoryIds = (
  fromOffset: number,
  toOffset: number,
): number[] => {
  const low = Math.floor(Math.min(fromOffset, toOffset));
  const high = Math.ceil(Math.max(fromOffset, toOffset));
  const ids: number[] = [];
  for (let id = low; id <= high; id += 1) ids.push(id);
  return ids;
};
