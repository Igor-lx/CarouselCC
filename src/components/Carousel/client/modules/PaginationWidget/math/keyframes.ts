import { sampleBezier } from "../../../motion/bezier";
import type { CubicBezier } from "../../../motion/types";
import { writeDotProjection } from "./projection";
import type {
  PaginationWidgetDotState,
  PaginationWidgetGeometry,
} from "../types";

/** One sampled point of a projected trajectory, at time-progress `offset`. */
export interface DotKeyframeSample {
  /** WAAPI keyframe offset — time progress in `[0, 1]`. */
  offset: number;
  x: number;
  scale: number;
  /** Edge-fade opacity of the dot body. */
  opacity: number;
  /** Active-glow strength `[0, 1]`. */
  activeStrength: number;
}

/**
 * Resolves which page-dot id a DOM node represents at a deck offset. The widget
 * uses a fixed identity per node (see `fixedIdAt`); the parameter is kept for
 * the general baking signature.
 */
export type DotIdAt = (offset: number) => number;

/**
 * Bake a node's projected trajectory across an eased deck-offset sweep into
 * `steps + 1` keyframes.
 *
 * The projection (`writeDotProjection`) is nonlinear — exponential edge drift,
 * lookup-table interpolation for `x`/`scale`, piecewise `opacity` — and a
 * recycling node additionally re-targets its id mid-sweep, so the trajectory is
 * not expressible as one CSS easing. Instead we *bake* it: keyframe `i` sits at
 * time-progress `p = i / steps`, and its visual state is the projection of the
 * node's id evaluated at the eased deck offset (`from + (to - from) *
 * bezier(p)`). Played back by WAAPI with linear interpolation between keyframes,
 * this reproduces the per-frame JS path to sub-pixel accuracy at sufficient
 * `steps`, entirely on the compositor thread.
 *
 * With a fixed page-dot identity the trajectory is continuous, so the baked
 * keyframes match the per-frame path exactly (up to the sampling density).
 *
 * Pure: one reused scratch projection object, no other allocation.
 */
export const buildProjectionKeyframes = (
  idAt: DotIdAt,
  fromOffset: number,
  toOffset: number,
  easing: CubicBezier,
  geometry: PaginationWidgetGeometry,
  steps: number,
): DotKeyframeSample[] => {
  const samples: DotKeyframeSample[] = [];
  const scratch: PaginationWidgetDotState = {
    id: 0,
    x: 0,
    scale: 0,
    opacity: 0,
    activeStrength: 0,
    isActive: false,
  };
  const span = toOffset - fromOffset;
  const safeSteps = Math.max(1, Math.floor(steps));

  for (let i = 0; i <= safeSteps; i += 1) {
    const p = i / safeSteps;
    const eased = sampleBezier(easing, p).progress;
    const offset = fromOffset + span * eased;
    writeDotProjection(scratch, idAt(offset), offset, geometry);
    samples.push({
      offset: p,
      x: scratch.x,
      scale: scratch.scale,
      opacity: scratch.opacity,
      activeStrength: scratch.activeStrength,
    });
  }

  return samples;
};

/**
 * Id resolver for a fixed page-dot identity. The widget animates one node per
 * page (not per recycling slot), so a dot's id never changes across a segment
 * and its projected trajectory (slide / scale / fade / glow) is continuous —
 * the property WAAPI keyframe interpolation needs. A recycling-slot id would
 * teleport mid-sweep and interpolate into a visible lurch.
 */
export const fixedIdAt =
  (id: number): DotIdAt =>
  () =>
    id;
