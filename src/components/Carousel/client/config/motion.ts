/** Repeated-click fast-segment peak speed, as a multiple of a normal MOVE. */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 5;

/** Fraction of the repeated-click segment distance spent ramping up. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.3;

/** Fraction of the repeated-click segment distance spent ramping down. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/** Master switch of the far-GO_TO teleport (see docs/architecture/motion.md). */
export const GO_TO_TELEPORT_ENABLED = true;

/** Page screens animated BEFORE a far-GO_TO teleport. */
export const GO_TO_PREFLIGHT_PAGE_SPAN = 1;

/** Page screens animated AFTER a far-GO_TO teleport (fixed calm settle). */
export const GO_TO_FINAL_APPROACH_PAGE_SPAN = 1;

/**
 * Minimum INTERMEDIATE pages (endpoints excluded) from which a GO_TO flies
 * instead of riding. Must exceed `preflight + approach` or it fires idle
 * (Diagnostics reports it). See docs/architecture/motion.md.
 */
export const GO_TO_TELEPORT_MIN_PAGE_SPAN = 3;

/** GO_TO acceleration share, local to the first page screen. */
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 0.35;

/** GO_TO deceleration share, local to the final page screen. */
export const GO_TO_DECELERATION_DISTANCE_SHARE = 0.35;

/** GO_TO peak cruise speed as a multiple of the normal one-step MOVE speed. */
export const GO_TO_SPEED_MULTIPLIER = 10;

// Duration-authored step profiles: accel/decel distance shares (remainder is
// cruise). Feel constants — tune under UX review. See docs/architecture/motion.md.

/** Click step and non-inertial gesture release: soft symmetric-ish ramp. */
export const STEP_ACCELERATION_DISTANCE_SHARE = 0.35;
export const STEP_DECELERATION_DISTANCE_SHARE = 0.4;

/** Autoplay step: front-loaded — moves out early, long calm settle. */
export const AUTOPLAY_ACCELERATION_DISTANCE_SHARE = 0.4;
export const AUTOPLAY_DECELERATION_DISTANCE_SHARE = 0.5;

/** Snap-back after a no-intent drag release: near-immediate ease-out tail. */
export const SNAP_BACK_ACCELERATION_DISTANCE_SHARE = 0.08;
export const SNAP_BACK_DECELERATION_DISTANCE_SHARE = 0.7;

/** Duration of a snap-back when the user drag-releases without intent (ms). */
export const SNAP_BACK_DURATION = 1300;
