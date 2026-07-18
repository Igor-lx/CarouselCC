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

/** The dot at integer `index` as seen from a live `offset`. */
export const dotStateAt = (
  index: number,
  offset: number,
  inactive: DotVisualState,
  active: DotVisualState,
): DotVisualState => {
  const strength = dotActiveStrength(index - offset);
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
): DotFadeKeyframe[] =>
  keyframesAlongStops(fromOffset, toOffset, stops, (offset) => {
    const state = dotStateAt(index, offset, inactive, active);
    return { opacity: state.opacity, transform: `scaleX(${state.scale})` };
  });

/** Dots that can show anything at all along `fromOffset -> toOffset`: strength
 * reaches zero a full step away, so only these need animating — the rest stay
 * on their class styles. */
export const reachedDotIndexes = (
  fromOffset: number,
  toOffset: number,
  pageCount: number,
): number[] => {
  const low = Math.max(0, Math.ceil(Math.min(fromOffset, toOffset) - 1));
  const high = Math.min(pageCount - 1, Math.floor(Math.max(fromOffset, toOffset) + 1));
  const ids: number[] = [];
  for (let id = low; id <= high; id += 1) ids.push(id);
  return ids;
};
