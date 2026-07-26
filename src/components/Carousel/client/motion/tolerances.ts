/** Float-noise tolerance for motion-sample comparisons (the runner's "already
 * there" check, the reducer's settle identity) — an implementation constant,
 * not a feel knob, so it lives here rather than in config/. */
export const MOTION_EPSILON = 0.0001;
