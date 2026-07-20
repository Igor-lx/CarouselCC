/**
 * The MEDIA FACADE — one hook (`useMedia`) that resolves a whole set of
 * media axes at once (width tiers + orientation + arbitrary flag
 * conditions), composing the standalone hooks in `../library`. Returns the
 * active breakpoint name, orientation, per-flag booleans, an ad-hoc
 * `matches`, and a `signature` that changes iff any tracked verdict does.
 *
 * Uniform facade-package layout: facade-only glue lives under `internal/`,
 * `tests/` holds the guards, this `index.ts` is the only public surface, and
 * `useMedia` is the one facade hook at the root. The single-axis
 * primitives are NOT re-exported here — they are their own library
 * (`../library`); take them from there when you need just one.
 */
export { useMedia } from "./useMedia";
export type { MediaState } from "./useMedia";
export { canonicalMediaQueries } from "./internal/canonicalMedia";
export type { MediaAxes } from "./internal/canonicalMedia";
