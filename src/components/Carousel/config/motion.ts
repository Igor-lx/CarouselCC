/**
 * Where inside the *next* page step the fast repeated-click segment finishes.
 * `1` means "fly all the way to one full page ahead", then the follow-up
 * segment continues normalising to the final target. This factor is part of
 * the visual contract — changing it changes how a fast click feels.
 */
export const REPEATED_CLICK_DESTINATION_POSITION = 1;

/**
 * Touch-specific destination. On touch, the fast segment lands closer to the
 * final target, leaving less follow-up.
 */
export const REPEATED_CLICK_TOUCH_DESTINATION_POSITION = 0.99;

/**
 * Peak speed of the repeated-click fast segment relative to a normal MOVE.
 * Controls how strongly a click during motion accelerates the carousel.
 */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 5;

/** Fraction of the fast segment distance dedicated to ramp-up. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.35;

/** Fraction of the fast segment distance dedicated to ramp-down. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/** Cubic-bezier curves expressed as CSS strings. */
export const JUMP_BEZIER = "cubic-bezier(0.16, 1, 0.3, 1)";
export const MOVE_BEZIER = "cubic-bezier(0.32, 0.2, 0.28, 1)";
export const AUTO_BEZIER = "cubic-bezier(0.28, 0.72, 0.38, 1)";
export const SNAP_BACK_BEZIER = "cubic-bezier(0.18, 0.82, 0.28, 1)";

/** Duration of a snap-back when the user drag-releases without intent. */
export const SNAP_BACK_DURATION = 1300;
