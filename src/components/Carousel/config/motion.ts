/**
 * Peak speed of the repeated-click fast segment relative to a normal MOVE.
 * Controls how strongly a click during motion accelerates the carousel.
 * A repeated click drives straight to the next page boundary and decays to
 * zero speed - there is no intermediate target.
 */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 5;

/** Fraction of the fast segment distance dedicated to ramp-up. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.35;

/** Fraction of the fast segment distance dedicated to ramp-down. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/**
 * Number of page screens animated before a far-GO_TO teleport. After the
 * teleport the carousel always shows one cruise page and the final approach
 * page. GO_TO spans that fit within that visible budget animate directly
 * without teleport.
 */
export const GO_TO_PREFLIGHT_PAGE_SPAN = 1;

/**
 * Acceleration / deceleration distance shares of the GO_TO profile.
 *
 * Both shares are local to one page screen:
 * - acceleration is measured inside the first page screen;
 * - deceleration is measured inside the final page screen.
 *
 * A deceleration share of `1` means "use the whole final page screen to slow
 * down"; `0` means cruise to the target and stop sharply there.
 */
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 1;
export const GO_TO_DECELERATION_DISTANCE_SHARE = 1;

/** Cubic-bezier curves expressed as CSS strings. */
export const MOVE_BEZIER = "cubic-bezier(0.32, 0.2, 0.28, 1)";
export const AUTO_BEZIER = "cubic-bezier(0.28, 0.72, 0.38, 1)";
export const SNAP_BACK_BEZIER = "cubic-bezier(0.18, 0.82, 0.28, 1)";

/** Duration of a snap-back when the user drag-releases without intent. */
export const SNAP_BACK_DURATION = 1300;
