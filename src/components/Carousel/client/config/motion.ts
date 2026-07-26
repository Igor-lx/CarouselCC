// Motion-profile distance shares and GO_TO geometry.
// See docs/config/motion.md for what each governs.

/** Repeated-click fast-segment peak speed, × a normal MOVE. */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 5;
/** Repeated-click ramp-up share. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.3;
/** Repeated-click ramp-down share. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/** Master switch for the far-GO_TO teleport. */
export const GO_TO_TELEPORT_ENABLED = true;
/** Page screens animated before a far-GO_TO teleport. */
export const GO_TO_PREFLIGHT_PAGE_SPAN = 1;
/** Page screens animated after a far-GO_TO teleport (fixed calm settle). */
export const GO_TO_FINAL_APPROACH_PAGE_SPAN = 1;
/** Min intermediate pages from which a GO_TO flies (must exceed preflight+approach). */
export const GO_TO_TELEPORT_MIN_PAGE_SPAN = 3;
/** GO_TO acceleration share, local to the first page screen. */
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 0.35;
/** GO_TO deceleration share, local to the final page screen. */
export const GO_TO_DECELERATION_DISTANCE_SHARE = 0.35;
/** GO_TO peak cruise speed, × the normal one-step MOVE speed. */
export const GO_TO_SPEED_MULTIPLIER = 10;

/** Click-step / non-inertial-release ramp-up share. */
export const STEP_ACCELERATION_DISTANCE_SHARE = 0.35;
/** Click-step / non-inertial-release ramp-down share. */
export const STEP_DECELERATION_DISTANCE_SHARE = 0.4;

/** Autoplay-step ramp-up share (front-loaded). */
export const AUTOPLAY_ACCELERATION_DISTANCE_SHARE = 0.4;
/** Autoplay-step ramp-down share (long calm settle). */
export const AUTOPLAY_DECELERATION_DISTANCE_SHARE = 0.5;

/** Snap-back ramp-up share. */
export const SNAP_BACK_ACCELERATION_DISTANCE_SHARE = 0.08;
/** Snap-back ramp-down share (near-immediate ease-out tail). */
export const SNAP_BACK_DECELERATION_DISTANCE_SHARE = 0.7;

/** Snap-back duration after a no-intent drag release (ms). */
export const SNAP_BACK_DURATION = 1300;
