/**
 * Tolerance for motion-sample position/velocity comparisons (the runner's
 * "already there" check, the reducer's settle identity). An IMPLEMENTATION
 * constant, not a feel knob: it exists to absorb float noise in the sample
 * math, and changing it requires understanding every comparison it guards —
 * which is why it lives here, next to the motion layer, and not in config/.
 */
export const MOTION_EPSILON = 0.0001;
