/**
 * The motion time domain, as one importable clock: `performance.now()` when
 * available, `Date.now()` otherwise (SSR-safe). Controller samples, segment
 * `startedAt` stamps, and WAAPI `startTime` pinning all live in this single
 * domain — consumers read the clock from here and never mix in another time
 * source, or the compositor and the JS controller drift out of phase.
 */
export const motionNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
