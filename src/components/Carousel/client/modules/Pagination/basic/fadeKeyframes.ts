/**
 * Dot look as a FUNCTION OF POSITION — the pagination's half of the model the
 * widget already runs.
 *
 * The dots do not move, but the carousel's position between them does. The
 * binding animates one continuous `offset` from the page being left to the
 * page being entered, along the plan's percent-progress stops; every dot's
 * look is then read off its distance from that offset. Nothing about a dot is
 * authored in time, so a page merely PASSED THROUGH (a repeated click) rises
 * to the active look and falls again on the deck's own clock, exactly as the
 * widget's dot does when the strip slides it past the centre.
 */

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

/**
 * How strongly the ACTIVE look applies to a dot `distance` steps away from the
 * live offset: fully right under it, not at all a whole step away or further.
 *
 * Linear deliberately: across a single step it reproduces exactly the blend
 * the old two-dot cross-fade produced (a dot one step ahead has strength
 * `progress`), so an ordinary click looks the way it always did — only the
 * repeated click changes.
 */
export const dotActiveStrength = (distance: number): number =>
  Math.max(0, 1 - Math.abs(distance));

/**
 * Distance from a dot to the live offset. In cyclic mode the strip has no
 * ends: stepping back off page 0 lands on the last page, one step away — not
 * `pageCount - 1` away. Measuring that as a plain difference is what made the
 * offset sweep the whole strip on a wrap.
 */
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

/**
 * Where the offset must travel for this command. In cyclic mode the target
 * page is reachable both ways round; the plan's DIRECTION says which way the
 * deck actually went, and the offset follows it — one step off the end goes
 * to `-1` or `pageCount`, never the long way across every dot.
 */
export const resolveOffsetTarget = (
  from: number,
  targetPageIndex: number,
  pageCount: number,
  direction: number,
  isFinite: boolean,
): number => {
  if (isFinite || pageCount <= 0) return targetPageIndex;
  const base = Math.round(from);
  const forward = (((targetPageIndex - base) % pageCount) + pageCount) % pageCount;
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

/**
 * Keyframes for one dot as the offset travels `fromOffset -> toOffset` along
 * the temporal `stops`: the i-th keyframe is the dot's look at the offset the
 * plan has reached by stop i. Same stop-encoded transport the track and the
 * widget use, so the dot rides the deck's curve without an easing function.
 */
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
    const state = dotStateAt(index, offset, inactive, active, pageCount, isFinite);
    return { opacity: state.opacity, transform: `scaleX(${state.scale})` };
  });

/** Dots that can show anything at all along `fromOffset -> toOffset`: strength
 * reaches zero a full step away, so only these need animating — the rest stay
 * on their class styles. */
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
    for (let id = Math.max(0, low); id <= Math.min(pageCount - 1, high); id += 1) {
      ids.push(id);
    }
    return ids;
  }
  // Cyclic: the path may run past either end, so fold the swept positions back
  // onto real dot indexes (a wrap touches the dots at the far end, not the
  // ones in between).
  const seen = new Set<number>();
  for (let position = low; position <= high; position += 1) {
    seen.add(((position % pageCount) + pageCount) % pageCount);
  }
  return [...seen].sort((a, b) => a - b);
};
