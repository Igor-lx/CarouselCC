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

/**
 * The RETARGET pulse: a dot that was still rising when a repeated command
 * arrived rides its whole cycle anyway — on up to the active look, then back
 * down to resting — instead of being turned around from wherever it had got to.
 *
 * Without it a fast second click catches the incoming dot a few percent into
 * its rise and immediately walks it back, so the eye sees a barely-there
 * twitch and the dot never reads as "this page was passed through".
 *
 * Both halves are blended along the SAME plan stops the normal fade uses, so
 * the pulse carries the deck's own curve; because those stops decelerate into
 * their endpoint, the dot eases into the active look and out of it again,
 * giving a natural beat at the peak rather than a corner.
 */
export const buildPulseKeyframes = (
  from: DotVisualState,
  peak: DotVisualState,
  to: DotVisualState,
  stops: readonly number[],
): DotFadeKeyframe[] => [
  ...buildFadeKeyframes(from, peak, stops),
  // Drop the duplicated peak frame so the two halves stay evenly distributed
  // across the animation and the peak lands exactly at its midpoint.
  ...buildFadeKeyframes(peak, to, stops).slice(1),
];
