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
 * Largest GO_TO span, in page screens, that is animated edge-to-edge. A jump
 * within this span animates its whole distance; a longer jump animates a
 * bounded preflight, teleports across the un-rendered middle, then animates a
 * bounded approach. Keeps far jumps from mounting every intermediate slide in
 * large decks. See `motion/timing.ts` (`resolveGoToPlan`).
 */
export const GO_TO_MAX_ANIMATED_PAGE_SPAN = 2;

/**
 * Acceleration / deceleration distance shares of the *one* canonical GO_TO
 * speed profile (`[accelerate] -> [cruise] -> [decelerate]`).
 *
 * - A short GO_TO applies the shares to its real distance.
 * - A teleport applies them to a fixed visible distance, so every long jump
 *   has a byte-identical ramp-up and ramp-down regardless of span.
 *
 * The remainder (`1 - acceleration - deceleration`) is the constant-speed
 * cruise zone. Cruise is the only interval where a teleport can be spliced
 * without a velocity discontinuity, so it must stay positive. A small
 * acceleration share with a larger deceleration share reproduces the historic
 * "shoot out, ease in" jump feel.
 */
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 0.12;
export const GO_TO_DECELERATION_DISTANCE_SHARE = 0.5;

/** Cubic-bezier curves expressed as CSS strings. */
export const MOVE_BEZIER = "cubic-bezier(0.32, 0.2, 0.28, 1)";
export const AUTO_BEZIER = "cubic-bezier(0.28, 0.72, 0.38, 1)";
export const SNAP_BACK_BEZIER = "cubic-bezier(0.18, 0.82, 0.28, 1)";

/** Duration of a snap-back when the user drag-releases without intent. */
export const SNAP_BACK_DURATION = 1300;
