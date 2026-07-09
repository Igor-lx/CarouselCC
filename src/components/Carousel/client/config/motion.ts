/**
 * Peak speed of the repeated-click fast segment relative to a normal MOVE.
 * Controls how strongly a click during motion accelerates the carousel.
 * A repeated click drives straight to the next page boundary and decays to
 * zero speed - there is no intermediate target.
 */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 7;

/** Fraction of the fast segment distance dedicated to ramp-up. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.3;

/** Fraction of the fast segment distance dedicated to ramp-down. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/**
 * Number of page screens animated before a far-GO_TO teleport. After the
 * teleport the carousel shows only the final approach page. GO_TO spans that
 * fit within preflight + final approach animate directly without teleport.
 */
export const GO_TO_PREFLIGHT_PAGE_SPAN = 2;

/**
 * Number of page screens animated AFTER a far-GO_TO teleport. The post-teleport
 * approach is fixed (does not scale with span), so every far jump ends with
 * the same calm settling distance regardless of how far the jump was. Bounding
 * it to whole pages also keeps the teleport cut on a page boundary by
 * construction.
 */
export const GO_TO_FINAL_APPROACH_PAGE_SPAN = 1;

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
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 0.5;
export const GO_TO_DECELERATION_DISTANCE_SHARE = 0.5;

/**
 * Motion-profile distance shares for the duration-authored steps. Every
 * carousel motion is a single accel/cruise/decel profile (there are no
 * cubic-bezier curves anywhere): the shares below shape each step kind, the
 * engine derives the peak speed from distance + duration, and the resulting
 * percent-progress curve drives both the track and the pagination widget
 * through one WAAPI easing.
 *
 * A share is the fraction of the travelled DISTANCE spent ramping; what is
 * left is constant-speed cruise. These are feel constants (visual contract) —
 * tune under UX review.
 */

/** Click step and non-inertial gesture release: soft symmetric-ish ramp. */
export const STEP_ACCELERATION_DISTANCE_SHARE = 0.35;
export const STEP_DECELERATION_DISTANCE_SHARE = 0.4;

/** Autoplay step: front-loaded — moves out early, long calm settle. */
export const AUTOPLAY_ACCELERATION_DISTANCE_SHARE = 0.1;
export const AUTOPLAY_DECELERATION_DISTANCE_SHARE = 0.6;

/** Snap-back after a no-intent drag release: near-immediate ease-out tail. */
export const SNAP_BACK_ACCELERATION_DISTANCE_SHARE = 0.08;
export const SNAP_BACK_DECELERATION_DISTANCE_SHARE = 0.7;

/** Duration of a snap-back when the user drag-releases without intent. */
export const SNAP_BACK_DURATION = 1300;
