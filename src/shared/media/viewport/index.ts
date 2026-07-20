/**
 * The VIEWPORT FACADE — one hook (`useViewport`) that answers "what viewport
 * state are we in" for a caller-supplied set of axes (width tiers +
 * orientation + arbitrary flag conditions), composing the standalone hooks
 * in `../library`.
 *
 * Uniform facade-package layout: facade-only glue lives under `internal/`,
 * `tests/` holds the guards, this `index.ts` is the only public surface, and
 * `useViewport` is the one facade hook at the root. The single-axis
 * primitives are NOT re-exported here — they are their own library
 * (`../library`); take them from there when you need just one.
 */
export { useViewport } from "./useViewport";
export type { Viewport } from "./useViewport";
export { viewportCanonicalMedia } from "./internal/canonicalMedia";
export type { ViewportAxes } from "./internal/canonicalMedia";
