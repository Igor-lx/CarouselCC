/**
 * Pure keyframe math for the pagination cross-fade. The engine's plan carries
 * the TEMPORAL shape as percent-progress stops; a dot's fade is the linear
 * blend of its visual state (opacity + active scale) evaluated at each stop —
 * the same stop-encoded keyframe transport the track and the widget use, so
 * the dot's fade decelerates exactly with the deck.
 */

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

export const buildFadeKeyframes = (
  from: DotVisualState,
  to: DotVisualState,
  stops: readonly number[],
): DotFadeKeyframe[] => {
  const frames: DotFadeKeyframe[] = new Array(stops.length);
  for (let i = 0; i < stops.length; i += 1) {
    const p = stops[i]!;
    frames[i] = {
      opacity: from.opacity + (to.opacity - from.opacity) * p,
      transform: `scaleX(${from.scale + (to.scale - from.scale) * p})`,
    };
  }
  return frames;
};
