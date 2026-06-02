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
 * Resolves which page-dot id a given DOM node represents at a deck offset.
 * Slot nodes recycle (their id is `round(offset) - side + slotIndex`, so it
 * steps as the deck crosses a half-integer); active-glow nodes track
 * `floor`/`ceil(offset)`. A fixed page-dot id ignores the offset.
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
 * node's id-at-that-offset evaluated at the eased deck offset
 * (`from + (to - from) * bezier(p)`). Played back by WAAPI with linear
 * interpolation between keyframes, this reproduces the per-frame JS path to
 * sub-pixel accuracy at sufficient `steps`, entirely on the compositor thread.
 *
 * A recycle (id step) lands between two adjacent keyframes as a one-interval
 * slide rather than an instant jump; at a dense `steps` that interval is a few
 * milliseconds and imperceptible, and — because the dot nodes are visually
 * interchangeable — the *ensemble* is identical to the per-frame model.
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

/** Id resolver for a recycling slot node at `slotIndex` (0-based across the strip). */
export const slotIdAt =
  (slotIndex: number, side: number): DotIdAt =>
  (offset) =>
    Math.round(offset) - side + slotIndex;

/** Id resolver for the floor/ceil active-glow node (`which`: 0 = floor, 1 = ceil). */
export const activeIdAt =
  (which: 0 | 1): DotIdAt =>
  (offset) =>
    which === 0 ? Math.floor(offset) : Math.ceil(offset);

/** Id resolver for a fixed page-dot id (no recycling). */
export const fixedIdAt =
  (id: number): DotIdAt =>
  () =>
    id;
