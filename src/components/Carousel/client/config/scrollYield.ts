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
 * one, and retuning ride speeds never needs a matching edit here. Lower =
 * calmer strip under scroll but a longer visible crawl; 1 disables the
 * slowdown effect entirely (the ride keeps its speed).
 */
export const SCROLL_YIELD_CRAWL_SPEED_SHARE = 0.15;

/**
 * Time budget of the ramp from the live speed down to the crawl, ms. Authored
 * in TIME (not distance) because the deadline it serves — be slow before the
 * browser-chrome settle stalls presentation — does not scale with how far the
 * ride still has to travel. Shorter = the strip yields more abruptly;
 * 0 = instant drop to crawl (legitimate, just sharp).
 */
export const SCROLL_YIELD_BRAKE_DURATION_MS = 200;

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
 * Distance shares of the resume profile — the accel/cruise/decel shape that
 * carries the ride from the crawl back to its pre-brake cruise and into the
 * normal arrival. The peak of that profile is NOT a knob: it is the speed the
 * ride actually had when the brake engaged.
 */
export const SCROLL_YIELD_RESUME_ACCELERATION_DISTANCE_SHARE = 0.35;
export const SCROLL_YIELD_RESUME_DECELERATION_DISTANCE_SHARE = 0.4;
