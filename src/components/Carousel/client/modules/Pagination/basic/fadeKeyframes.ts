// Dot look as a function of position — one offset travels the plan's stops, each
// dot's look reads off its distance from it. See docs/architecture/modules.md
import { mod } from "../../../domain";
import { keyframesAlongStops } from "../../../motion";

export interface DotVisualState {
  opacity: number;
  /** Horizontal scale of the dot (the active dot is stretched). */
  scale: number;
}

/** A type alias (not an interface) so it stays assignable to the DOM
 * `Keyframe` type's index signature. */
export type DotFadeKeyframe = {
  opacity: number;
  transform: string;
};

/** Active-look strength for a dot `distance` steps away: full under it, zero a step away. */
export const dotActiveStrength = (distance: number): number =>
  Math.max(0, 1 - Math.abs(distance));

/** Dot→offset distance; cyclic mode wraps (one step off page 0 is one, not pageCount-1). */
export const offsetDistance = (
  index: number,
  offset: number,
  pageCount: number,
  isFinite: boolean,
): number => {
  const raw = Math.abs(index - offset);
  if (isFinite || pageCount <= 0) return raw;
  const wrapped = raw % pageCount;
  return Math.min(wrapped, pageCount - wrapped);
};

/** Where the offset travels; cyclic mode follows the plan's DIRECTION, not the long way. */
export const resolveOffsetTarget = (
  from: number,
  targetPageIndex: number,
  pageCount: number,
  direction: number,
  isFinite: boolean,
): number => {
  if (isFinite || pageCount <= 0) return targetPageIndex;
  const base = Math.round(from);
  const forward = mod(targetPageIndex - base, pageCount);
  if (forward === 0) return base;
  return direction < 0 ? base + forward - pageCount : base + forward;
};

/** The dot at integer `index` as seen from a live `offset`. */
export const dotStateAt = (
  index: number,
  offset: number,
  inactive: DotVisualState,
  active: DotVisualState,
  pageCount: number,
  isFinite: boolean,
): DotVisualState => {
  const strength = dotActiveStrength(
    offsetDistance(index, offset, pageCount, isFinite),
  );
  return {
    opacity: inactive.opacity + (active.opacity - inactive.opacity) * strength,
    scale: inactive.scale + (active.scale - inactive.scale) * strength,
  };
};

/** Keyframes for one dot as the offset travels the plan's stops (sweep). */
export const buildDotKeyframes = (
  index: number,
  fromOffset: number,
  toOffset: number,
  stops: readonly number[],
  inactive: DotVisualState,
  active: DotVisualState,
  pageCount: number,
  isFinite: boolean,
): DotFadeKeyframe[] =>
  keyframesAlongStops(fromOffset, toOffset, stops, (offset) => {
    const state = dotStateAt(
      index,
      offset,
      inactive,
      active,
      pageCount,
      isFinite,
    );
    return { opacity: state.opacity, transform: `scaleX(${state.scale})` };
  });

/** Linear blend of two dot looks — the direct cross-fade's path. */
export const blendDotStates = (
  from: DotVisualState,
  to: DotVisualState,
  progress: number,
): DotVisualState => ({
  opacity: from.opacity + (to.opacity - from.opacity) * progress,
  scale: from.scale + (to.scale - from.scale) * progress,
});

/** Keyframes fading one dot STRAIGHT between two looks (GO_TO direct delivery). */
export const dotKeyframesBetween = (
  from: DotVisualState,
  to: DotVisualState,
  stops: readonly number[],
): DotFadeKeyframe[] =>
  keyframesAlongStops(0, 1, stops, (progress) => {
    const state = blendDotStates(from, to, progress);
    return { opacity: state.opacity, transform: `scaleX(${state.scale})` };
  });

/** Dots that can show anything along the sweep — only these need animating. */
export const reachedDotIndexes = (
  fromOffset: number,
  toOffset: number,
  pageCount: number,
  isFinite: boolean,
): number[] => {
  const low = Math.ceil(Math.min(fromOffset, toOffset) - 1);
  const high = Math.floor(Math.max(fromOffset, toOffset) + 1);
  if (isFinite) {
    const ids: number[] = [];
    for (
      let id = Math.max(0, low);
      id <= Math.min(pageCount - 1, high);
      id += 1
    ) {
      ids.push(id);
    }
    return ids;
  }
  // Cyclic: fold swept positions back onto real dot indexes (a wrap touches the far end).
  const seen = new Set<number>();
  for (let position = low; position <= high; position += 1) {
    seen.add(mod(position, pageCount));
  }
  return [...seen].sort((a, b) => a - b);
};
