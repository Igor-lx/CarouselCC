// WAAPI keyframe sampling: the plan's temporal stops fold with each dot's
// spatial path into one keyframe list (no easing fn). See docs/architecture/modules.md
import { keyframesAlongStops } from "../../../../motion";
import { writeDotProjection } from "./projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "../types";

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
  stops: readonly number[],
  opacityOf: (state: PaginationWidgetDotState) => number,
): DotTrajectoryKeyframe[] =>
  keyframesAlongStops(fromOffset, toOffset, stops, (offset) => {
    const state = writeDotProjection(scratch, id, offset, geometry);
    return {
      transform: toTransform(state.x, state.scale),
      opacity: opacityOf(state),
    };
  });

/** Keyframes of a regular dot (`id`) as the widget offset travels
 * `fromOffset -> toOffset` along the temporal `stops`. */
export const sampleDotTrajectory = (
  id: number,
  fromOffset: number,
  toOffset: number,
  geometry: PaginationWidgetGeometry,
  stops: readonly number[],
): DotTrajectoryKeyframe[] =>
  sampleTrajectory(
    id,
    fromOffset,
    toOffset,
    geometry,
    stops,
    (state) => state.opacity,
  );

/** Keyframes of an active-highlight overlay for integer page `id`: same
 * spatial path, but its opacity is the active strength (1 at the exact page,
 * fading over one step distance). */
export const sampleActiveDotTrajectory = (
  id: number,
  fromOffset: number,
  toOffset: number,
  geometry: PaginationWidgetGeometry,
  stops: readonly number[],
): DotTrajectoryKeyframe[] =>
  sampleTrajectory(
    id,
    fromOffset,
    toOffset,
    geometry,
    stops,
    (state) => state.activeStrength,
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
