/**
 * Scroll-yield tuning — the mid-ride "vinyl brake": while the page is
 * scrolled, an in-flight ride dives into a slow-mo crawl and, the instant the
 * finger lifts (or a fling settles), whooshes back to speed and finishes.
 * See useScrollRideYield; the toolbar-settle mechanism it serves is in
 * PERF-INVESTIGATION §9.3. All values are feel knobs; the yield's scope and
 * triggers are structural and do not live here.
 */

/**
 * Crawl speed as a SHARE of the ride's live speed at the moment the dive
 * begins ((0, 1]). Relative, not absolute, so the slow-mo scales with whatever
 * speed the ride's own tuning produced. This is the line between "slow-motion"
 * and "nearly stopped": around a quarter of the live speed still reads as
 * continuous motion; well below that the eye reads a stall. 1 disables the
 * slowdown entirely.
 */
export const SCROLL_YIELD_CRAWL_SPEED_SHARE = 0.25;

/**
 * Dive ramp duration as a SHARE of the RIDE'S OWN duration — the dive into
 * slow-mo is proportional to the tempo the ride was authored at (step,
 * autoplay, swipe, repeated-click all differ), never an absolute millisecond
 * count that fits one tempo and jars another. A fast ride dives in a blink, a
 * slow one a touch more deliberately; both feel of a piece with the ride. The
 * ramp itself is ease-out (steepest at the start), so even a proportionally
 * short dive still reads as an instant, responsive drop.
 */
export const SCROLL_YIELD_ENTRY_DURATION_SHARE = 0.22;

/**
 * Exit ramp duration as a SHARE of the ride's own duration — symmetric to the
 * dive, for the same reason. The exit is ease-out too (steepest the instant
 * the finger lifts), so the strip whooshes back to speed immediately.
 */
export const SCROLL_YIELD_EXIT_DURATION_SHARE = 0.22;

/**
 * Fraction of the remaining distance the resumed ride spends decelerating into
 * its arrival — the normal calm landing after the exit ramp and cruise.
 */
export const SCROLL_YIELD_ARRIVAL_DECELERATION_DISTANCE_SHARE = 0.4;

/**
 * How long with NO page-scroll signal counts as "the scroll has settled", ms.
 * This is a fling-settle DETECTOR, not a deliberate hold: it must be short
 * (about two display frames) so the exit follows a fling's end promptly. It
 * is NOT the finger-lift path — a lift with the scroll already idle resumes
 * on the touch event itself, with no delay at all (the old 300 ms quiet timer
 * WAS the "залипон" the redesign removes). A finger that rests on the glass
 * with the scroll stopped keeps the slow-mo until it lifts.
 */
export const SCROLL_YIELD_SCROLL_IDLE_MS = 80;
