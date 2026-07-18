/**
 * Pagination feel constants. Module-local, like the widget's own defaults —
 * they shape this module's presentation and nothing outside it.
 */

/**
 * How long the retarget pulse lasts, as a SHARE of the plan's own duration.
 *
 * When a repeated command arrives mid-fade, the dot it caught still rises to
 * the active look and falls back (see `buildPulseKeyframes`) — but compressed,
 * so it reads as "passed through" rather than "the destination". A share, not
 * a millisecond count: the pulse then scales with whatever tempo the ride was
 * authored at, under any tuning of the step/autoplay durations.
 *
 * Below 1 the pulse finishes before the deck does, which is the point — the
 * intermediate dot is done and resting by the time the real destination dot
 * arrives, and only that last dot lands together with the slide. At 1 the two
 * would finish simultaneously and the pulse would stop reading as a pass.
 */
export const RETARGET_PULSE_DURATION_SHARE = 0.45;
