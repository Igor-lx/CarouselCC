/**
 * Scroll-yield tuning — the mid-ride graceful slowdown while the page is
 * scrolled and the browser chrome settles (see useScrollRideYield; mechanism
 * in PERF-INVESTIGATION §9.3). All values are feel knobs; the yield's scope
 * and triggers are structural and do not live here.
 */

/**
 * Crawl speed as a SHARE of the ride's live speed at the moment the brake
 * engages ((0, 1]). Relative, not absolute, so the yield scales with whatever
 * speed the ride's own tuning produced: a fast ride crawls faster than a slow
 * one, and retuning ride speeds never needs a matching edit here. The value
 * draws the line between "slow-motion" and "nearly stopped": around a quarter
 * of the live speed still reads as continuous motion; well below that the eye
 * reads a stall. 1 disables the slowdown effect entirely.
 */
export const SCROLL_YIELD_CRAWL_SPEED_SHARE = 0.25;

/**
 * Time budget of the ramp from the live speed down to the crawl, ms. Authored
 * in TIME (not distance) because the deadline it serves — be slow before the
 * browser-chrome settle stalls presentation — does not scale with how far the
 * ride still has to travel. Shorter = the strip yields more abruptly;
 * 0 = instant drop to crawl (legitimate, just sharp).
 */
export const SCROLL_YIELD_BRAKE_DURATION_MS = 450;

/**
 * Quiet tail after the LAST page-scroll signal (scroll frame, window resize,
 * visualViewport resize) before the ride accelerates back to its pre-brake
 * cruise. The window self-extends on every signal — scroll frames during the
 * fling and resize events during the chrome settle all push the resume out —
 * so this only needs to cover the silence after the settle's final event,
 * not the fling or the settle themselves.
 */
export const SCROLL_YIELD_RESUME_QUIET_DELAY_MS = 300;

/**
 * Time budget of the ramp from the crawl back UP to the pre-brake cruise, ms.
 * TIME-authored like the brake, and for the same reason: the "snap back to
 * life" must feel identical whether a tenth of a slide remains or three — a
 * distance-share ramp at crawl speeds stretches with the remaining distance
 * and reads as sluggish. The cruise it ramps to is NOT a knob: it is the
 * speed the ride actually had when the brake engaged.
 */
export const SCROLL_YIELD_RESUME_RAMP_DURATION_MS = 300;

/**
 * Fraction of the remaining distance the resumed ride spends decelerating
 * into its arrival — the normal calm landing after the ramp and cruise.
 */
export const SCROLL_YIELD_RESUME_DECELERATION_DISTANCE_SHARE = 0.4;
