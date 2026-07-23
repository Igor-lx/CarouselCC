/**
 * Peak speed of the repeated-click fast segment relative to a normal MOVE.
 * Controls how strongly a click during motion accelerates the carousel.
 * A repeated click drives straight to the next page boundary and decays to
 * zero speed - there is no intermediate target.
 */
export const REPEATED_CLICK_SPEED_MULTIPLIER = 5;

/** Fraction of the fast segment distance dedicated to ramp-up. */
export const REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE = 0.3;

/** Fraction of the fast segment distance dedicated to ramp-down. */
export const REPEATED_CLICK_DECELERATION_DISTANCE_SHARE = 0.35;

/**
 * Master switch of the far-GO_TO teleport.
 *
 * `true`  — jumps whose span passes the gate (see
 *           GO_TO_TELEPORT_MIN_PAGE_SPAN) fly: preflight, instant cut,
 *           final approach. Jumps that ride but would take LONGER than a
 *           flight are time-capped to the flight envelope (they cruise
 *           slightly faster), so ride and flight durations meet seamlessly.
 * `false` — no jump ever flies and no time cap applies: every GO_TO rides
 *           the full distance at the one shared cruise speed
 *           (GO_TO_SPEED_MULTIPLIER), so duration grows with distance.
 *           The three span knobs below are inert in this mode.
 *
 * Before this switch the only way to suppress flying was a knob ratio that
 * never passes the gate; this makes the intent explicit.
 */
export const GO_TO_TELEPORT_ENABLED = true;

/**
 * Number of page screens animated before a far-GO_TO teleport. After the
 * teleport the carousel shows only the final approach page. GO_TO spans that
 * fit within preflight + final approach animate directly without teleport.
 */
export const GO_TO_PREFLIGHT_PAGE_SPAN = 1;

/**
 * Number of page screens animated AFTER a far-GO_TO teleport. The post-teleport
 * approach is fixed (does not scale with span), so every far jump ends with
 * the same calm settling distance regardless of how far the jump was. Bounding
 * it to whole pages also keeps the teleport cut on a page boundary by
 * construction.
 */
export const GO_TO_FINAL_APPROACH_PAGE_SPAN = 1;

/**
 * Minimum number of INTERMEDIATE pages (pages strictly between the start
 * page and the target page — neither endpoint counts) from which a GO_TO
 * FLIES (teleports the never-shown middle) instead of riding the whole
 * distance.
 *
 * A flight additionally requires that at least one intermediate page would
 * never be shown at all: preflight and approach each show their own pages,
 * so the structural floor is `preflight + approach + 1` intermediates.
 * Setting this knob below that floor breaks nothing — every jump simply
 * rides continuously — but the knob then fires idle (Diagnostics reports
 * it). With preflight 1 / approach 1: `3` means "1→5 flies, skipping the
 * middle page entirely; 1→4 rides — both its intermediates are shown
 * anyway, so there is nothing to skip".
 */
export const GO_TO_TELEPORT_MIN_PAGE_SPAN = 3;

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
export const GO_TO_ACCELERATION_DISTANCE_SHARE = 0.35;
export const GO_TO_DECELERATION_DISTANCE_SHARE = 0.35;

/**
 * GO_TO peak cruise speed as a multiple of the normal one-step MOVE speed.
 * A jump's duration then falls out of distance and profile, so a near and a
 * far jump share one consistent cruise speed.
 *
 * A tuning constant, not a prop: it is a DIMENSIONLESS internal ratio, only
 * meaningful next to the step-speed derivation it multiplies
 * (`resolveJumpPeakSpeed` = stepSpeed x this). The host already sets the jump
 * tempo through `durationStep` — jump speed scales with it — so what is left
 * here is the engine's own feel decision, exactly like the accel/decel shares
 * above. Values below 1 make a GO_TO slower than a single step, which inverts
 * the visual contract (diagnostics flag it).
 *
 * With the teleport ENABLED this cruise is also bounded in TIME: a ride that
 * would outlast a flight (preflight + approach at this cruise) is compressed
 * to exactly the flight duration and cruises faster — so no jump is ever
 * slower than a farther one. Teleport disabled = no ceiling, pure speed law.
 */
export const GO_TO_SPEED_MULTIPLIER = 10;

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
export const AUTOPLAY_ACCELERATION_DISTANCE_SHARE = 0.4;
export const AUTOPLAY_DECELERATION_DISTANCE_SHARE = 0.5;

/** Snap-back after a no-intent drag release: near-immediate ease-out tail. */
export const SNAP_BACK_ACCELERATION_DISTANCE_SHARE = 0.08;
export const SNAP_BACK_DECELERATION_DISTANCE_SHARE = 0.7;

/** Duration of a snap-back when the user drag-releases without intent. */
export const SNAP_BACK_DURATION = 1300;
